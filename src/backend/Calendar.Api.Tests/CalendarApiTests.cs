using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Calendar.Api.Controllers;
using Calendar.Api.Generated;
using Calendar.Api.Infrastructure;
using Calendar.Api.Models;
using Calendar.Api.Repositories;
using Calendar.Api.Services;
using Dapper;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
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
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;

        // When the calendar is created and retrieved using its Location header.
        var response = await calendarContext.CreateAsync(new { title = "  Julekalender æøå 🎄  " });
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
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;
        var response = await calendarContext.CreateAsync(new { title = "Stored calendar" });
        var created = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        await using var connection = new NpgsqlConnection(calendarContext.Auth.ConnectionString);
        await connection.ExecuteAsync(
            "UPDATE doors SET content_text = @Text WHERE calendar_id = @Id AND day_number = 2",
            new { Text = "Stored surprise 🎁", created.Id }
        );
        await using var restarted = fixture.Application(
            connectionString: calendarContext.Auth.ConnectionString,
            time: calendarContext.Auth.Time
        );
        using var restartedClient = restarted.CreateClient();
        await calendarContext.Auth.LoginAsync(calendarContext.Owner, restartedClient);

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
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;
        var firstResponse = await calendarContext.CreateAsync(new { title = "Same title" });
        var first = (await firstResponse.Content.ReadFromJsonAsync<CalendarDto>())!;

        // When another calendar is created with that title.
        var response = await calendarContext.CreateAsync(new { title = first.Title });
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
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;
        await using var connection = new NpgsqlConnection(calendarContext.Auth.ConnectionString);
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
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;
        await using var connection = new NpgsqlConnection(calendarContext.Auth.ConnectionString);

        // When both title variants are submitted and the database boundary is checked.
        var accepted = await calendarContext.CreateAsync(new { title = $"  {title}  " });
        var rejected = await calendarContext.CreateAsync(new { title = title + unit });
        var storedLength = await connection.ExecuteScalarAsync<int>(
            "SELECT char_length(@Title)",
            new { Title = title }
        );
        var insertOverlongTitle = () =>
            connection.ExecuteAsync(
                "INSERT INTO calendars SELECT @Id, @Title, created_at, last_modified_at, owner_id, recipient_id, calendar_year, background, layout, door_order FROM calendars LIMIT 1",
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
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;

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
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;
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
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;
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
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;
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
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;
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
        // Given an owned aggregate whose doors violate the unique-number constraint.
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var response = await calendarContext.CreateAsync(new { title = "Atomic" });
        var dto = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        using var scope = calendarContext.Application.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<ICalendarRepository>();
        var transaction = scope.ServiceProvider.GetRequiredService<ISecurityTransaction>();
        var invalid = new CalendarModel(
            Guid.NewGuid(),
            "Atomic",
            dto.CreatedAt,
            dto.CreatedAt,
            [new DoorModel(1, "", "a"), new DoorModel(1, "", "duplicate")],
            dto.OwnerId,
            dto.RecipientId,
            dto.Year,
            "woodland",
            "chronological",
            dto.DoorOrder.ToArray(),
            dto.RecipientName,
            dto.RecipientUsername
        );

        // When insertion is attempted within the shared transaction.
        var insertInvalidCalendar = () =>
            transaction.RunAsync(
                async () =>
                {
                    await repository.InsertAsync(invalid);
                    return true;
                },
                CancellationToken.None
            );

        // Then the failed aggregate is rolled back completely.
        await Assert.ThrowsAsync<PostgresException>(insertInvalidCalendar);
        Assert.Equal(
            0,
            await calendarContext.Auth.ScalarAsync<int>(
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
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;
        var response = await calendarContext.CreateAsync(new { title = "Door constraints" });
        var calendar = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        await using var connection = new NpgsqlConnection(calendarContext.Auth.ConnectionString);

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
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;
        var response = await calendarContext.CreateAsync(new { title = "Text constraints" });
        var calendar = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        await using var connection = new NpgsqlConnection(calendarContext.Auth.ConnectionString);

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

    [Fact(
        DisplayName = "Given an edited calendar, When the API restarts, Then its saved content is preserved"
    )]
    public async Task GivenEditedCalendarWhenRestartingThenPreservesSavedContent()
    {
        // Given an owned calendar with a saved edit.
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var response = await calendarContext.CreateAsync(new { title = "My calendar" });
        var created = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        await calendarContext.Auth.ExecuteAsync(
            "UPDATE doors SET content_text = 'preserved' WHERE calendar_id = @Id AND day_number = 1",
            new { created.Id }
        );

        // When another application instance retrieves it with the persisted session.
        await using var restarted = fixture.Application(
            connectionString: calendarContext.Auth.ConnectionString,
            time: calendarContext.Auth.Time
        );
        using var restartedClient = restarted.CreateClient();
        await calendarContext.Auth.LoginAsync(calendarContext.Owner, restartedClient);
        var calendar = (
            await restartedClient.GetFromJsonAsync<CalendarDto>($"/calendars/{created.Id}")
        )!;

        // Then migration restart preserves all saved data.
        Assert.Equal(created.Title, calendar.Title);
        Assert.Equal("preserved", calendar.Doors[0].Text);
        Assert.Equal(24, calendar.Doors.Count);
    }

    [Theory(
        DisplayName = "Given generated API routes, When MVC discovers endpoints, Then health and calendar operations belong to their dedicated controllers"
    )]
    [InlineData("health/live", "GET", typeof(HealthController))]
    [InlineData("health/ready", "GET", typeof(HealthController))]
    [InlineData("calendars", "POST", typeof(CalendarsController))]
    [InlineData("calendars/{id}", "GET", typeof(CalendarsController))]
    public async Task GivenApiRoutesWhenDiscoveringEndpointsThenMapsDedicatedControllers(
        string route,
        string method,
        Type controller
    )
    {
        // Given an initialized API using the generated controller contracts.
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        var client = calendarContext.Client;

        // When MVC exposes its concrete route endpoints and action metadata.
        var endpoints = app.Services.GetRequiredService<EndpointDataSource>().Endpoints;
        var endpoint = Assert.Single(
            endpoints.OfType<RouteEndpoint>(),
            candidate =>
                candidate.RoutePattern.RawText == route
                && candidate
                    .Metadata.GetMetadata<HttpMethodMetadata>()!
                    .HttpMethods.Contains(method)
        );
        var action = endpoint.Metadata.GetMetadata<ControllerActionDescriptor>();

        // Then each HTTP route has exactly one action on the intended controller.
        Assert.NotNull(action);
        Assert.Equal(controller, action.ControllerTypeInfo.AsType());
        Assert.Equal(
            method,
            Assert.Single(endpoint.Metadata.GetMetadata<HttpMethodMetadata>()!.HttpMethods)
        );
    }

    [Fact(
        DisplayName = "Given an anonymous client and a healthy database, When an outage occurs and recovers, Then liveness stays healthy and readiness reports both states as plain text"
    )]
    public async Task GivenHealthyDatabaseWhenOutageRecoversThenLivenessStaysOkAndReadinessRecovers()
    {
        // Given a running API connected to its isolated PostgreSQL container.
        await using var calendarContext = await CalendarTestContext.CreateAsync(fixture);
        var app = calendarContext.Application;
        using var client = app.CreateClient();
        using var initialLive = await client.GetAsync("/health/live");
        using var initialReady = await client.GetAsync("/health/ready");
        HttpResponseMessage outageLive;
        HttpResponseMessage outageReady;

        // When this database refuses connections and existing connections are terminated.
        // Keep the container API responsive so recovery cannot depend on a paused engine.
        await using var admin = new NpgsqlConnection(fixture.Database.GetConnectionString());
        var database = new NpgsqlConnectionStringBuilder(
            calendarContext.Auth.ConnectionString
        ).Database!;
        var quotedDatabase = new NpgsqlCommandBuilder().QuoteIdentifier(database);
        await admin.ExecuteAsync($"ALTER DATABASE {quotedDatabase} ALLOW_CONNECTIONS false");
        await admin.ExecuteAsync(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = @Database",
            new { Database = database }
        );
        try
        {
            outageLive = await client.GetAsync("/health/live");
            outageReady = await client.GetAsync("/health/ready");
        }
        finally
        {
            await admin.ExecuteAsync($"ALTER DATABASE {quotedDatabase} ALLOW_CONNECTIONS true");
        }
        using var recoveredReady = await WaitForReadinessAsync(client);

        // Then the process stays live, readiness detects the outage, and the same API recovers.
        using (outageLive)
        using (outageReady)
        {
            await AssertHealth(initialLive, HttpStatusCode.OK);
            await AssertHealth(initialReady, HttpStatusCode.OK);
            await AssertHealth(outageLive, HttpStatusCode.OK);
            await AssertHealth(outageReady, HttpStatusCode.ServiceUnavailable);
            await AssertHealth(recoveredReady, HttpStatusCode.OK);
        }
    }

    private static async Task<HttpResponseMessage> WaitForReadinessAsync(HttpClient client)
    {
        // Probe actual recovery; fail within a fixed deadline if availability never returns.
        using var recoveryDeadline = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        while (true)
        {
            var response = await client.GetAsync("/health/ready", recoveryDeadline.Token);
            if (response.StatusCode != HttpStatusCode.ServiceUnavailable)
                return response;
            response.Dispose();
            await Task.Delay(TimeSpan.FromMilliseconds(250), recoveryDeadline.Token);
        }
    }

    private static async Task AssertHealth(HttpResponseMessage response, HttpStatusCode status)
    {
        Assert.Equal(status, response.StatusCode);
        Assert.Equal("text/plain", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal(
            status == HttpStatusCode.OK ? "Healthy" : "Unhealthy",
            await response.Content.ReadAsStringAsync()
        );
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
