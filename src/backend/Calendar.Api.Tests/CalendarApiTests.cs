using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Calendar.Api.Generated;
using Calendar.Api.Infrastructure;
using Calendar.Api.Models;
using Calendar.Api.Repositories;
using Calendar.Api.Services;
using Dapper;
using Npgsql;
using Xunit;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class CalendarApiTests(ApiFixture fixture)
{
    [Fact]
    public async Task CreateAndRetrievePersistedAggregate()
    {
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/calendars",
            new { title = "  Julekalender æøå 🎄  " }
        );
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        Assert.Equal("Julekalender æøå 🎄", created.Title);
        Assert.Equal('4', created.Id.ToString("D")[14]);
        Assert.Equal(TimeSpan.Zero, created.CreatedAt.Offset);
        Assert.Equal(created.CreatedAt, created.LastModifiedAt);
        Assert.Equal(Enumerable.Range(1, 24), created.Doors.Select(door => door.Number));
        Assert.All(created.Doors, door => Assert.Equal(string.Empty, door.Text));
        Assert.Equal($"/calendars/{created.Id:D}", response.Headers.Location!.ToString());
        var retrieved = await client.GetAsync(response.Headers.Location);
        Assert.Equal(HttpStatusCode.OK, retrieved.StatusCode);
        Assert.Equal(
            await response.Content.ReadAsStringAsync(),
            await retrieved.Content.ReadAsStringAsync()
        );

        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());
        await connection.ExecuteAsync(
            "UPDATE doors SET content_text = @Text WHERE calendar_id = @Id AND day_number = 2",
            new { Text = "Stored surprise 🎁", created.Id }
        );
        var stored = (await client.GetFromJsonAsync<CalendarDto>(response.Headers.Location))!;
        Assert.Equal("Stored surprise 🎁", stored.Doors[1].Text);

        var second = (
            await (
                await client.PostAsJsonAsync("/calendars", new { title = created.Title })
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        Assert.NotEqual(created.Id, second.Id);
        await using var restarted = fixture.Application();
        using var restartedClient = restarted.CreateClient();
        Assert.Equal(
            "Stored surprise 🎁",
            (await restartedClient.GetFromJsonAsync<CalendarDto>(response.Headers.Location))!
                .Doors[1]
                .Text
        );
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"title\":null}")]
    [InlineData("{\"title\":\"\"}")]
    [InlineData("{\"title\":\"   \"}")]
    [InlineData("{\"title\":3}")]
    [InlineData("{\"title\":\"\\u0000\"}")]
    [InlineData("{\"title\":\"ok\",\"owner\":\"no\"}")]
    [InlineData("null")]
    [InlineData("{")]
    public async Task InvalidBodiesReturnProblemAndCreateNothing(string json)
    {
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());
        var before = await connection.ExecuteScalarAsync<long>("SELECT count(*) FROM calendars");
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        var response = await client.PostAsync("/calendars", content);
        await AssertProblem(response, HttpStatusCode.BadRequest);
        Assert.Equal(
            before,
            await connection.ExecuteScalarAsync<long>("SELECT count(*) FROM calendars")
        );
    }

    [Theory]
    [InlineData("a")]
    [InlineData("a .")]
    [InlineData("æ")]
    [InlineData("ø")]
    [InlineData("å")]
    [InlineData("🎄")]
    [InlineData("a\u030a")]
    [InlineData("👩‍👩‍👧‍👦")]
    public async Task UnicodeApiAndDatabaseUseSameCodePointBoundary(string unit)
    {
        var points = unit.EnumerateRunes().ToArray();
        var title = string.Concat(
            Enumerable.Range(0, 100).Select(index => points[index % points.Length].ToString())
        );
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        var accepted = await client.PostAsJsonAsync("/calendars", new { title = $"  {title}  " });
        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
        Assert.Equal(title, (await accepted.Content.ReadFromJsonAsync<CalendarDto>())!.Title);
        var rejected = await client.PostAsJsonAsync("/calendars", new { title = title + unit });
        await AssertProblem(rejected, HttpStatusCode.BadRequest);

        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());
        Assert.Equal(
            100,
            await connection.ExecuteScalarAsync<int>(
                "SELECT char_length(@Title)",
                new { Title = title }
            )
        );
        var exception = await Assert.ThrowsAsync<PostgresException>(() =>
            connection.ExecuteAsync(
                "INSERT INTO calendars VALUES (@Id, @Title, now(), now())",
                new { Id = Guid.NewGuid(), Title = title + unit }
            )
        );
        Assert.Equal(PostgresErrorCodes.CheckViolation, exception.SqlState);
    }

    [Fact]
    public async Task RouteBindingErrorsAndTraceContext()
    {
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        await AssertProblem(
            await client.GetAsync("/calendars/not-a-uuid"),
            HttpStatusCode.BadRequest
        );
        await AssertProblem(
            await client.GetAsync($"/calendars/{Guid.NewGuid():D}"),
            HttpStatusCode.NotFound
        );
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/calendars/{Guid.NewGuid():D}"
        );
        request.Headers.Add(
            "traceparent",
            "00-12345678901234567890123456789012-1234567890123456-01"
        );
        var response = await client.SendAsync(request);
        var problem = (await response.Content.ReadFromJsonAsync<ApiProblemDetails>())!;
        Assert.Equal("12345678901234567890123456789012", problem.TraceId);
        await Task.WhenAll(
            Enumerable
                .Range(0, 8)
                .Select(async _ =>
                {
                    var traceId = Guid.NewGuid().ToString("N");
                    using var concurrent = new HttpRequestMessage(
                        HttpMethod.Get,
                        $"/calendars/{Guid.NewGuid():D}"
                    );
                    concurrent.Headers.Add("traceparent", $"00-{traceId}-1234567890123456-01");
                    using var reply = await client.SendAsync(concurrent);
                    Assert.Equal(
                        traceId,
                        (await reply.Content.ReadFromJsonAsync<ApiProblemDetails>())!.TraceId
                    );
                })
        );
        using var content = new StringContent("title");
        await AssertProblem(
            await client.PostAsync("/calendars", content),
            HttpStatusCode.UnsupportedMediaType
        );
    }

    [Fact]
    public async Task DoorFailureRollsBackWholeCalendarAndConstraintsApply()
    {
        await using var source = NpgsqlDataSource.Create(fixture.Database.GetConnectionString());
        await DatabaseStartup.MigrateAsync(
            fixture.Database.GetConnectionString(),
            1,
            CancellationToken.None
        );
        var repository = new CalendarRepository(source);
        var service = new CalendarService(repository, TimeProvider.System);
        var invalid = service.Initialize("Atomic") with
        {
            Doors = [new DoorModel(1, "a"), new DoorModel(1, "duplicate")],
        };
        await Assert.ThrowsAsync<PostgresException>(() =>
            repository.InsertAsync(invalid, CancellationToken.None)
        );
        await using var connection = await source.OpenConnectionAsync();
        Assert.Equal(
            0,
            await connection.ExecuteScalarAsync<int>(
                "SELECT count(*)::int FROM calendars WHERE id = @Id",
                new { invalid.Id }
            )
        );
        var calendar = await service.CreateAsync("Constraints", CancellationToken.None);
        foreach (var number in new[] { 0, 25 })
        {
            await Assert.ThrowsAsync<PostgresException>(() =>
                connection.ExecuteAsync(
                    "INSERT INTO doors VALUES (@Id, @Number, '')",
                    new { calendar.Id, Number = number }
                )
            );
        }
        await Assert.ThrowsAsync<PostgresException>(() =>
            connection.ExecuteAsync(
                "UPDATE doors SET content_text = NULL WHERE calendar_id = @Id",
                new { calendar.Id }
            )
        );
    }

    [Theory]
    [InlineData("Development", false)]
    [InlineData("Production", true)]
    [InlineData("Production", false)]
    public async Task SeedRequiresBothDevelopmentAndEnabled(string environment, bool seed)
    {
        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());
        await DatabaseStartup.MigrateAsync(
            fixture.Database.GetConnectionString(),
            1,
            CancellationToken.None
        );
        await connection.ExecuteAsync(
            "DELETE FROM calendars WHERE id = @Id",
            new { Id = LocalSeed.CalendarId }
        );
        await using var app = fixture.Application(environment, seed);
        using var client = app.CreateClient();
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"/calendars/{LocalSeed.CalendarId}")).StatusCode
        );
    }

    [Fact]
    public async Task SeedIsIdempotentAndPreservesEditedContent()
    {
        await using (var app = fixture.Application("Development", true))
        {
            using var client = app.CreateClient();
            Assert.Equal(
                HttpStatusCode.OK,
                (await client.GetAsync($"/calendars/{LocalSeed.CalendarId}")).StatusCode
            );
        }
        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());
        await connection.ExecuteAsync(
            "UPDATE doors SET content_text = 'preserved' WHERE calendar_id = @Id AND day_number = 1",
            new { Id = LocalSeed.CalendarId }
        );
        await using var restarted = fixture.Application("Development", true);
        using var restartedClient = restarted.CreateClient();
        Assert.Equal(
            "preserved",
            (
                await restartedClient.GetFromJsonAsync<CalendarDto>(
                    $"/calendars/{LocalSeed.CalendarId}"
                )
            )!
                .Doors[0]
                .Text
        );
        Assert.Equal(
            1,
            await connection.ExecuteScalarAsync<int>(
                "SELECT count(*)::int FROM calendars WHERE id = @Id",
                new { Id = LocalSeed.CalendarId }
            )
        );
    }

    [Fact]
    public async Task HealthSeparatesProcessFromDatabaseAvailability()
    {
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/ready")).StatusCode);
        await fixture.Database.StopAsync();
        try
        {
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
            Assert.Equal(
                HttpStatusCode.ServiceUnavailable,
                (await client.GetAsync("/health/ready")).StatusCode
            );
        }
        finally
        {
            await fixture.Database.StartAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/ready")).StatusCode);
    }

    private static async Task AssertProblem(HttpResponseMessage response, HttpStatusCode status)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal((int)status, json.RootElement.GetProperty("status").GetInt32());
        Assert.False(string.IsNullOrEmpty(json.RootElement.GetProperty("traceId").GetString()));
        Assert.Equal(JsonValueKind.Object, json.RootElement.GetProperty("errors").ValueKind);
    }
}
