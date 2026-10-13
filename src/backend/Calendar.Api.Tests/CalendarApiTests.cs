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
    [Fact(
        DisplayName = "Given a padded Unicode title, When a calendar is created and retrieved, Then its trimmed title and 24 initialized doors are persisted"
    )]
    public async Task GivenPaddedTitleWhenCreatingCalendarThenPersistsInitializedAggregate()
    {
        // Given a running API and a title with surrounding whitespace and Unicode.
        await using var app = fixture.Application();
        using var client = app.CreateClient();

        // When the calendar is created and retrieved using its Location header.
        var response = await client.PostAsJsonAsync(
            "/calendars",
            new { title = "  Julekalender æøå 🎄  " }
        );
        var created = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        var retrieved = await client.GetAsync(response.Headers.Location);

        // Then creation returns the initialized values and retrieval returns those same values.
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("Julekalender æøå 🎄", created.Title);
        Assert.Equal('4', created.Id.ToString("D")[14]);
        Assert.Equal(TimeSpan.Zero, created.CreatedAt.Offset);
        Assert.Equal(created.CreatedAt, created.LastModifiedAt);
        Assert.Equal(Enumerable.Range(1, 24), created.Doors.Select(door => door.Number));
        Assert.All(created.Doors, door => Assert.Equal(string.Empty, door.Text));
        Assert.Equal($"/calendars/{created.Id:D}", response.Headers.Location!.ToString());
        Assert.Equal(HttpStatusCode.OK, retrieved.StatusCode);
        Assert.Equal(
            await response.Content.ReadAsStringAsync(),
            await retrieved.Content.ReadAsStringAsync()
        );
    }

    [Fact(
        DisplayName = "Given stored door text, When the calendar is retrieved before and after an API restart, Then both responses contain the saved edit"
    )]
    public async Task GivenEditedDoorTextWhenRetrievingAfterApiRestartThenReturnsPersistedText()
    {
        // Given a stored calendar with door text edited directly in the database.
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/calendars",
            new { title = "Stored calendar" }
        );
        var created = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());
        await connection.ExecuteAsync(
            "UPDATE doors SET content_text = @Text WHERE calendar_id = @Id AND day_number = 2",
            new { Text = "Stored surprise 🎁", created.Id }
        );
        await using var restarted = fixture.Application();
        using var restartedClient = restarted.CreateClient();

        // When both the current and restarted API retrieve that calendar.
        var stored = (await client.GetFromJsonAsync<CalendarDto>(response.Headers.Location))!;
        var afterRestart = (
            await restartedClient.GetFromJsonAsync<CalendarDto>(response.Headers.Location)
        )!;

        // Then both responses contain the saved edit rather than regenerated empty text.
        Assert.Equal("Stored surprise 🎁", stored.Doors[1].Text);
        Assert.Equal("Stored surprise 🎁", afterRestart.Doors[1].Text);
    }

    [Fact(
        DisplayName = "Given an existing calendar title, When another calendar uses that title, Then it receives a distinct ID"
    )]
    public async Task GivenExistingTitleWhenCreatingAnotherCalendarThenAssignsDistinctId()
    {
        // Given an existing calendar with the requested title.
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        var firstResponse = await client.PostAsJsonAsync(
            "/calendars",
            new { title = "Same title" }
        );
        var first = (await firstResponse.Content.ReadFromJsonAsync<CalendarDto>())!;

        // When another calendar is created with that title.
        var response = await client.PostAsJsonAsync("/calendars", new { title = first.Title });
        var second = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;

        // Then the request succeeds and does not reuse the original calendar ID.
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotEqual(first.Id, second.Id);
    }

    [Theory(
        DisplayName = "Given an invalid request body, When a calendar is created, Then the API returns a 400 problem without persisting a calendar"
    )]
    [InlineData("{}")]
    [InlineData("{\"title\":null}")]
    [InlineData("{\"title\":\"\"}")]
    [InlineData("{\"title\":\"   \"}")]
    [InlineData("{\"title\":3}")]
    [InlineData("{\"title\":\"\\u0000\"}")]
    [InlineData("{\"title\":\"ok\",\"owner\":\"no\"}")]
    [InlineData("null")]
    [InlineData("{")]
    public async Task GivenInvalidBodyWhenCreatingCalendarThenReturnsProblemWithoutWriting(
        string json
    )
    {
        // Given an invalid JSON request and the current persisted calendar count.
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());
        var before = await connection.ExecuteScalarAsync<long>("SELECT count(*) FROM calendars");
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        // When the body is submitted to the creation endpoint.
        var response = await client.PostAsync("/calendars", content);

        // Then the API reports the validation problem and persists nothing.
        await AssertProblem(response, HttpStatusCode.BadRequest);
        Assert.Equal(
            before,
            await connection.ExecuteScalarAsync<long>("SELECT count(*) FROM calendars")
        );
    }

    [Theory(
        DisplayName = "Given Unicode title variants at and beyond 100 code points, When they are validated, Then the API and database enforce the same boundary"
    )]
    [InlineData("a")]
    [InlineData("a .")]
    [InlineData("æ")]
    [InlineData("ø")]
    [InlineData("å")]
    [InlineData("🎄")]
    [InlineData("a\u030a")]
    [InlineData("👩‍👩‍👧‍👦")]
    public async Task GivenUnicodeTitleWhenCheckingLengthThenApiAndDatabaseUseCodePointBoundary(
        string unit
    )
    {
        // Given a Unicode title containing exactly 100 code points and an overlong variant.
        var points = unit.EnumerateRunes().ToArray();
        var title = string.Concat(
            Enumerable.Range(0, 100).Select(index => points[index % points.Length].ToString())
        );
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());

        // When both title variants are submitted and the database boundary is checked.
        var accepted = await client.PostAsJsonAsync("/calendars", new { title = $"  {title}  " });
        var rejected = await client.PostAsJsonAsync("/calendars", new { title = title + unit });
        var storedLength = await connection.ExecuteScalarAsync<int>(
            "SELECT char_length(@Title)",
            new { Title = title }
        );
        var insertOverlongTitle = () =>
            connection.ExecuteAsync(
                "INSERT INTO calendars VALUES (@Id, @Title, now(), now())",
                new { Id = Guid.NewGuid(), Title = title + unit }
            );

        // Then the response and database agree on the same Unicode length boundary.
        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
        Assert.Equal(title, (await accepted.Content.ReadFromJsonAsync<CalendarDto>())!.Title);
        await AssertProblem(rejected, HttpStatusCode.BadRequest);

        Assert.Equal(100, storedLength);
        var exception = await Assert.ThrowsAsync<PostgresException>(insertOverlongTitle);
        Assert.Equal(PostgresErrorCodes.CheckViolation, exception.SqlState);
    }

    [Fact(
        DisplayName = "Given a malformed UUID, When a calendar is requested, Then the API returns a structured 400 problem"
    )]
    public async Task GivenMalformedUuidWhenRetrievingCalendarThenReturnsBadRequestProblem()
    {
        // Given a running API and a route value that is not a UUID.
        await using var app = fixture.Application();
        using var client = app.CreateClient();

        // When that route is requested.
        var response = await client.GetAsync("/calendars/not-a-uuid");

        // Then model binding returns a structured 400 problem.
        await AssertProblem(response, HttpStatusCode.BadRequest);
    }

    [Fact(
        DisplayName = "Given an unknown UUID, When a calendar is requested, Then the API returns a structured 404 problem"
    )]
    public async Task GivenUnknownUuidWhenRetrievingCalendarThenReturnsNotFoundProblem()
    {
        // Given a running API and an ID that has never been stored.
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        var id = Guid.NewGuid();

        // When that calendar is requested.
        var response = await client.GetAsync($"/calendars/{id:D}");

        // Then the response is a structured 404 problem.
        await AssertProblem(response, HttpStatusCode.NotFound);
    }

    [Fact(
        DisplayName = "Given an incoming W3C trace context, When the request fails, Then the problem contains the incoming trace ID"
    )]
    public async Task GivenTraceparentWhenRequestFailsThenProblemContainsIncomingTraceId()
    {
        // Given a request with a known W3C trace context.
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/calendars/{Guid.NewGuid():D}"
        );
        request.Headers.Add(
            "traceparent",
            "00-12345678901234567890123456789012-1234567890123456-01"
        );

        // When the request fails because the calendar does not exist.
        var response = await client.SendAsync(request);
        var problem = (await response.Content.ReadFromJsonAsync<ApiProblemDetails>())!;

        // Then the problem preserves the incoming trace ID.
        Assert.Equal("12345678901234567890123456789012", problem.TraceId);
    }

    [Fact(
        DisplayName = "Given concurrent requests with distinct trace contexts, When the requests fail, Then each problem preserves its own trace ID"
    )]
    public async Task GivenConcurrentTraceContextsWhenRequestsFailThenEachProblemPreservesItsOwnTraceId()
    {
        // Given concurrent requests with distinct W3C trace IDs.
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        var traceIds = Enumerable.Range(0, 8).Select(_ => Guid.NewGuid().ToString("N")).ToArray();

        // When all requests are processed concurrently.
        var problems = await Task.WhenAll(
            traceIds.Select(async traceId =>
            {
                using var concurrent = new HttpRequestMessage(
                    HttpMethod.Get,
                    $"/calendars/{Guid.NewGuid():D}"
                );
                concurrent.Headers.Add("traceparent", $"00-{traceId}-1234567890123456-01");
                using var reply = await client.SendAsync(concurrent);
                return (await reply.Content.ReadFromJsonAsync<ApiProblemDetails>())!;
            })
        );

        // Then every response retains its own trace context without cross-request leakage.
        Assert.Equal(traceIds, problems.Select(problem => problem.TraceId));
    }

    [Fact(
        DisplayName = "Given a plain-text request body, When a calendar is created, Then the API returns a structured 415 problem"
    )]
    public async Task GivenTextBodyWhenCreatingCalendarThenReturnsUnsupportedMediaTypeProblem()
    {
        // Given a creation request with a text/plain body instead of JSON.
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        using var content = new StringContent("title");

        // When the body is submitted.
        var response = await client.PostAsync("/calendars", content);

        // Then the API reports the unsupported content type as a structured problem.
        await AssertProblem(response, HttpStatusCode.UnsupportedMediaType);
    }

    [Fact(
        DisplayName = "Given a calendar with duplicate door numbers, When it is inserted, Then the database rejects it and rolls back the entire aggregate"
    )]
    public async Task GivenDuplicateDoorNumbersWhenInsertingCalendarThenRollsBackWholeAggregate()
    {
        // Given an initialized calendar whose doors violate the unique-number constraint.
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

        // When insertion of that aggregate is attempted.
        var insertInvalidCalendar = () => repository.InsertAsync(invalid, CancellationToken.None);

        // Then the database rejects the doors and also rolls back the calendar row.
        await Assert.ThrowsAsync<PostgresException>(insertInvalidCalendar);
        await using var connection = await source.OpenConnectionAsync();
        Assert.Equal(
            0,
            await connection.ExecuteScalarAsync<int>(
                "SELECT count(*)::int FROM calendars WHERE id = @Id",
                new { invalid.Id }
            )
        );
    }

    [Theory(
        DisplayName = "Given a door number outside 1 through 24, When the door is inserted, Then the database rejects it with a check constraint violation"
    )]
    [InlineData(0)]
    [InlineData(25)]
    public async Task GivenOutOfRangeDoorNumberWhenInsertingDoorThenDatabaseRejectsIt(int number)
    {
        // Given a persisted calendar and a door number outside 1-24.
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/calendars",
            new { title = "Door constraints" }
        );
        var calendar = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());

        // When an out-of-range door is inserted directly.
        var insertDoor = () =>
            connection.ExecuteAsync(
                "INSERT INTO doors VALUES (@Id, @Number, '')",
                new { calendar.Id, Number = number }
            );

        // Then PostgreSQL enforces the door-number check constraint.
        var error = await Assert.ThrowsAsync<PostgresException>(insertDoor);
        Assert.Equal(PostgresErrorCodes.CheckViolation, error.SqlState);
    }

    [Fact(
        DisplayName = "Given a stored door, When its text is set to null, Then the database rejects it with a not-null violation"
    )]
    public async Task GivenStoredDoorWhenSettingTextToNullThenDatabaseRejectsIt()
    {
        // Given a persisted calendar containing non-null door text.
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/calendars",
            new { title = "Text constraints" }
        );
        var calendar = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());

        // When null text is written directly to its doors.
        var clearText = () =>
            connection.ExecuteAsync(
                "UPDATE doors SET content_text = NULL WHERE calendar_id = @Id",
                new { calendar.Id }
            );

        // Then PostgreSQL enforces non-null text.
        var error = await Assert.ThrowsAsync<PostgresException>(clearText);
        Assert.Equal(PostgresErrorCodes.NotNullViolation, error.SqlState);
    }

    [Theory(
        DisplayName = "Given an environment or setting that disables seeding, When the API starts, Then the sample calendar does not exist"
    )]
    [InlineData("Development", false)]
    [InlineData("Production", true)]
    [InlineData("Production", false)]
    public async Task GivenSeedConditionsNotMetWhenStartingApiThenSampleCalendarDoesNotExist(
        string environment,
        bool seed
    )
    {
        // Given a database without the sample and an environment/setting that must not seed.
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

        // When the application starts and the sample calendar is requested.
        using var client = app.CreateClient();
        var response = await client.GetAsync($"/calendars/{LocalSeed.CalendarId}");

        // Then neither the setting alone nor the environment alone enables seeding.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact(
        DisplayName = "Given an edited sample calendar, When the API restarts with development seeding enabled, Then one sample remains and its edit is preserved"
    )]
    public async Task GivenEditedSampleCalendarWhenRestartingWithSeedEnabledThenPreservesOneEditedSample()
    {
        // Given a seeded development calendar whose first door has been edited.
        HttpStatusCode initialStatus;
        await using (var app = fixture.Application("Development", true))
        {
            using var client = app.CreateClient();
            initialStatus = (
                await client.GetAsync($"/calendars/{LocalSeed.CalendarId}")
            ).StatusCode;
        }
        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());
        await connection.ExecuteAsync(
            "UPDATE doors SET content_text = 'preserved' WHERE calendar_id = @Id AND day_number = 1",
            new { Id = LocalSeed.CalendarId }
        );

        // When the application restarts with development seeding still enabled.
        await using var restarted = fixture.Application("Development", true);
        using var restartedClient = restarted.CreateClient();
        var sample = (
            await restartedClient.GetFromJsonAsync<CalendarDto>(
                $"/calendars/{LocalSeed.CalendarId}"
            )
        )!;
        var sampleCount = await connection.ExecuteScalarAsync<int>(
            "SELECT count(*)::int FROM calendars WHERE id = @Id",
            new { Id = LocalSeed.CalendarId }
        );

        // Then the seed exists once and retains its saved door text.
        Assert.Equal(HttpStatusCode.OK, initialStatus);
        Assert.Equal("preserved", sample.Doors[0].Text);
        Assert.Equal(1, sampleCount);
    }

    [Fact(
        DisplayName = "Given a healthy database, When an outage occurs and recovers, Then liveness stays healthy and readiness detects both states"
    )]
    public async Task GivenHealthyDatabaseWhenOutageRecoversThenLivenessStaysOkAndReadinessRecovers()
    {
        // Given a running API connected to its isolated PostgreSQL container.
        await using var app = fixture.Application();
        using var client = app.CreateClient();
        var initialLive = (await client.GetAsync("/health/live")).StatusCode;
        var initialReady = (await client.GetAsync("/health/ready")).StatusCode;
        HttpStatusCode outageLive;
        HttpStatusCode outageReady;

        // When PostgreSQL is suspended and resumed without replacing its published port.
        await fixture.Database.PauseAsync();
        try
        {
            outageLive = (await client.GetAsync("/health/live")).StatusCode;
            outageReady = (await client.GetAsync("/health/ready")).StatusCode;
        }
        finally
        {
            await fixture.Database.UnpauseAsync();
        }
        var recoveredReady = await WaitForReadinessAsync(client);

        // Then the process stays live, readiness detects the outage, and the same API recovers.
        Assert.Equal(HttpStatusCode.OK, initialLive);
        Assert.Equal(HttpStatusCode.OK, initialReady);
        Assert.Equal(HttpStatusCode.OK, outageLive);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, outageReady);
        Assert.Equal(HttpStatusCode.OK, recoveredReady);
    }

    private static async Task<HttpStatusCode> WaitForReadinessAsync(HttpClient client)
    {
        // Probe actual recovery; fail within a fixed deadline if availability never returns.
        using var recoveryDeadline = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        HttpStatusCode recoveryStatus;
        do
        {
            using var response = await client.GetAsync("/health/ready", recoveryDeadline.Token);
            recoveryStatus = response.StatusCode;
            if (recoveryStatus == HttpStatusCode.ServiceUnavailable)
                await Task.Delay(TimeSpan.FromMilliseconds(250), recoveryDeadline.Token);
        } while (recoveryStatus == HttpStatusCode.ServiceUnavailable);

        return recoveryStatus;
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
