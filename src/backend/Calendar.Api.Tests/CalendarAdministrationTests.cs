using System.Net;
using System.Net.Http.Json;
using System.Text;
using Calendar.Api.Generated;
using Calendar.Api.Models;
using Calendar.Api.Services;
using Calendar.Security;
using Dapper;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class CalendarAdministrationTests(ApiFixture fixture)
{
    [Theory(
        DisplayName = "Given an invalid persisted door permutation, When the database is updated, Then the layout constraint rejects the value"
    )]
    [InlineData("empty")]
    [InlineData("duplicate")]
    [InlineData("range")]
    public async Task DatabaseRejectsInvalidOrder(string scenario)
    {
        // Given a persisted calendar and an invalid permutation.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = (
            await (
                await context.CreateAsync(new { title = "Constraints" })
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        var order = scenario == "empty" ? [] : Enumerable.Range(1, 24).ToArray();
        if (scenario == "duplicate")
            order[23] = 1;
        if (scenario == "range")
            order[23] = 25;

        // When bypassing service validation with a direct database update.
        var action = () =>
            context.Auth.ExecuteAsync(
                "UPDATE calendars SET layout = 'random', door_order = @Order WHERE id = @Id",
                new { Order = order, calendar.Id }
            );

        // Then PostgreSQL rejects the invalid permutation independently.
        var error = await Assert.ThrowsAsync<PostgresException>(action);
        Assert.Equal(PostgresErrorCodes.CheckViolation, error.SqlState);
    }

    [Theory(
        DisplayName = "Given a pending calendar creation and a concurrent security change, When the transaction lock is released, Then the committing operation rechecks current authority"
    )]
    [InlineData("actor")]
    [InlineData("recipient")]
    public async Task CommittingCreationRechecksSecurity(string target)
    {
        // Given valid session state and an independently locked security transaction.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var sessionId = await context.Auth.ScalarAsync<Guid>(
            "SELECT id FROM account_sessions WHERE account_id = @Id AND NOT revoked",
            new { context.Owner.Id }
        );
        using var scope = context.Application.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<ICalendarService>();
        await using var connection = new NpgsqlConnection(context.Auth.ConnectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await connection.ExecuteAsync(
            "SELECT pg_advisory_xact_lock(800008)",
            transaction: transaction
        );

        // When creation queues behind a committed account role change or disablement.
        var create = service.CreateAsync(
            new SessionIdentity(context.Owner.Id, sessionId),
            "Concurrent",
            context.Recipient.Id,
            "woodland",
            CancellationToken.None
        );
        await connection.ExecuteAsync(
            target == "actor"
                ? "UPDATE accounts SET enabled = false WHERE id = @Id"
                : "UPDATE accounts SET account_role = 'calendarAdmin' WHERE id = @Id",
            new { Id = target == "actor" ? context.Owner.Id : context.Recipient.Id },
            transaction
        );
        await transaction.CommitAsync();
        var action = () => create;

        // Then no calendar commits using authority from before the concurrent change.
        await Assert.ThrowsAsync<AccountFailureException>(action);
        Assert.Equal(0, await context.Auth.ScalarAsync<int>("SELECT count(*)::int FROM calendars"));
    }

    [Fact(
        DisplayName = "Given multiple owned calendars, When the list is paginated, Then total count and pages contain only the current owner's metadata"
    )]
    public async Task OwnListPaginates()
    {
        // Given three owned calendars.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        foreach (var number in Enumerable.Range(1, 3))
            await context.CreateAsync(new { title = $"Calendar {number}" });

        // When requesting two pages of metadata.
        var first = (
            await context.Client.GetFromJsonAsync<CalendarListDto>("/calendars?offset=0&limit=2")
        )!;
        var second = (
            await context.Client.GetFromJsonAsync<CalendarListDto>("/calendars?offset=2&limit=2")
        )!;

        // Then the total is ownership scoped and each calendar occurs exactly once.
        Assert.Equal(3, first.TotalCount);
        Assert.Equal(3, second.TotalCount);
        Assert.Equal(2, first.Calendars.Count);
        Assert.Single(second.Calendars);
        Assert.Equal(
            3,
            first
                .Calendars.Concat(second.Calendars)
                .Select(calendar => calendar.Id)
                .Distinct()
                .Count()
        );
    }

    [Theory(
        DisplayName = "Given a malformed calendar setting, When an owner submits creation, Then it fails without persisting a calendar"
    )]
    [InlineData("background")]
    [InlineData("recipient")]
    [InlineData("owner")]
    public async Task InvalidCreationSettings(string field)
    {
        // Given a valid owner and a request with one manipulated setting.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var fields = new Dictionary<string, object>
        {
            ["title"] = "Invalid",
            ["recipientId"] = context.Recipient.Id,
            ["background"] = "woodland",
        };
        if (field == "background")
            fields["background"] = "remote-url";
        if (field == "recipient")
            fields["recipientId"] = Guid.NewGuid();
        if (field == "owner")
            fields["ownerId"] = Guid.NewGuid();

        // When submitting caller-controlled settings to the direct API.
        var response = await SendAsync(context.Client, HttpMethod.Post, "/calendars", fields);

        // Then invalid selections and caller-supplied ownership are rejected.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, await context.Auth.ScalarAsync<int>("SELECT count(*)::int FROM calendars"));
    }

    [Theory(
        DisplayName = "Given a calendar background, When an assigned user calendar is created, Then ownership and all empty doors are persisted"
    )]
    [InlineData("woodland")]
    [InlineData("sleigh")]
    [InlineData("playtime")]
    [InlineData("aurora")]
    public async Task CreationPersistsSettings(string background)
    {
        // Given an unrestricted owner and an assigned recipient.
        await using var context = await CalendarTestContext.CreateAsync(fixture);

        // When creating the protected aggregate with a chosen background.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/calendars",
            new
            {
                title = " Calendar ",
                recipientId = context.Recipient.Id,
                background,
            }
        );
        var created = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        var stored = (
            await context.Client.GetFromJsonAsync<CalendarDto>($"/calendars/{created.Id}")
        )!;

        // Then current ownership, selection and exactly 24 empty chronological doors persist.
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(context.Owner.Id, stored.OwnerId);
        Assert.Equal(context.Recipient.Id, stored.RecipientId);
        Assert.Equal(background, stored.Background.ToString().ToLowerInvariant());
        Assert.Equal(CalendarDtoLayout.Chronological, stored.Layout);
        Assert.Equal(Enumerable.Range(1, 24), stored.DoorOrder);
        Assert.All(
            stored.Doors,
            door =>
            {
                Assert.Equal("", door.Title);
                Assert.Equal("", door.Text);
            }
        );
        Assert.True(response.Headers.CacheControl?.NoStore);
    }

    [Fact(
        DisplayName = "Given distinctive door content, When layout changes and the calendar is reread, Then content stays numbered and random order remains stable"
    )]
    public async Task EditsAndLayoutPersist()
    {
        // Given an owned calendar with a future door and a controlled clock.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var created = (
            await (
                await context.CreateAsync(new { title = "Preparation" })
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        context.Auth.Time.Advance(TimeSpan.FromSeconds(1));
        var path = $"/calendars/{created.Id}";

        // When saving plain text, randomizing once and reading multiple times.
        var saved = await SendAsync(
            context.Client,
            HttpMethod.Put,
            path + "/doors/24",
            new { title = "Gift \U0001F381", text = "<b>Plain text</b>\nNext line" }
        );
        var random = (
            await (
                await SendAsync(
                    context.Client,
                    HttpMethod.Put,
                    path + "/layout",
                    new { layout = "random" }
                )
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        var reads = await Task.WhenAll(
            Enumerable.Range(0, 3).Select(_ => context.Client.GetFromJsonAsync<CalendarDto>(path))
        );

        // Then layout is a persisted permutation and only the selected door changed.
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal(Enumerable.Range(1, 24), random.DoorOrder.Order());
        Assert.Equal(CalendarDtoLayout.Random, random.Layout);
        Assert.All(reads, read => Assert.Equal(random.DoorOrder, read!.DoorOrder));
        Assert.Equal("Gift \U0001F381", random.Doors[23].Title);
        Assert.Equal("<b>Plain text</b>\nNext line", random.Doors[23].Text);
        Assert.All(random.Doors.Take(23), door => Assert.Equal("", door.Text));
        Assert.True(random.LastModifiedAt > created.LastModifiedAt);
    }

    [Theory(
        DisplayName = "Given Unicode door boundaries, When content is saved, Then code point limits allow exact bounds and reject overflow"
    )]
    [InlineData(50, 5000, HttpStatusCode.OK)]
    [InlineData(51, 5000, HttpStatusCode.BadRequest)]
    [InlineData(50, 5001, HttpStatusCode.BadRequest)]
    [InlineData(0, 0, HttpStatusCode.OK)]
    public async Task DoorUnicodeLimits(int titles, int messages, HttpStatusCode expected)
    {
        // Given an owned calendar and supplementary-plane Unicode content.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = (
            await (
                await context.CreateAsync(new { title = "Unicode" })
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        var title = string.Concat(Enumerable.Repeat("\U0001F381", titles));
        var text = string.Concat(Enumerable.Repeat("\U0001F384", messages));

        // When saving the requested code point counts.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Put,
            $"/calendars/{calendar.Id}/doors/1",
            new { title, text }
        );
        var stored = (
            await context.Client.GetFromJsonAsync<CalendarDto>($"/calendars/{calendar.Id}")
        )!;

        // Then the backend and database agree and rejected edits preserve prior content.
        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(expected == HttpStatusCode.OK ? text : "", stored.Doors[0].Text);
    }

    [Theory(
        DisplayName = "Given invalid door JSON, When an owner saves it, Then validation rejects it without modifying stored content"
    )]
    [InlineData("{}")]
    [InlineData("{\"title\":null,\"text\":\"x\"}")]
    [InlineData("{\"title\":\"x\",\"text\":null}")]
    [InlineData("{\"title\":\"x\"}")]
    [InlineData("{\"title\":\"\\u0000\",\"text\":\"x\"}")]
    [InlineData("{\"title\":\"\\uD800\",\"text\":\"x\"}")]
    public async Task InvalidDoorBody(string json)
    {
        // Given an owned calendar and an invalid raw JSON body.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = (
            await (
                await context.CreateAsync(new { title = "Invalid" })
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        using var body = new StringContent(json, Encoding.UTF8, "application/json");

        // When submitting without losing missing/null/invalid Unicode distinctions.
        var response = await context.Client.PutAsync($"/calendars/{calendar.Id}/doors/1", body);

        // Then the error is protected and no partial edit commits.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(
            "",
            await context.Auth.ScalarAsync<string>(
                "SELECT content_text FROM doors WHERE calendar_id = @Id AND day_number = 1",
                new { calendar.Id }
            )
        );
    }

    [Theory(
        DisplayName = "Given a session without calendar administration authority, When protected operations are requested, Then all content and mutations are denied"
    )]
    [InlineData("anonymous", HttpStatusCode.Unauthorized)]
    [InlineData("superadmin", HttpStatusCode.Forbidden)]
    [InlineData("calendarUser", HttpStatusCode.Forbidden)]
    [InlineData("restricted", HttpStatusCode.Forbidden)]
    [InlineData("disabled", HttpStatusCode.Unauthorized)]
    [InlineData("revoked", HttpStatusCode.Unauthorized)]
    [InlineData("expired", HttpStatusCode.Unauthorized)]
    public async Task DeniesUnauthorizedSessions(string scenario, HttpStatusCode expected)
    {
        // Given an owned calendar and an independently prepared caller session.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = (
            await (
                await context.CreateAsync(new { title = "Private" })
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        using var caller = context.Application.CreateClient();
        var actor = scenario switch
        {
            "superadmin" => await context.Auth.ProvisionAsync(),
            "calendarUser" => context.Recipient,
            _ => context.Owner,
        };
        if (scenario != "anonymous")
            await context.Auth.LoginAsync(actor, caller);
        if (scenario == "restricted")
            await context.Auth.ExecuteAsync(
                "UPDATE account_sessions SET is_restricted = true WHERE account_id = @Id",
                new { actor.Id }
            );
        if (scenario == "disabled")
            await context.Auth.ExecuteAsync(
                "UPDATE accounts SET enabled = false WHERE id = @Id",
                new { actor.Id }
            );
        if (scenario == "revoked")
            await context.Auth.ExecuteAsync(
                "UPDATE account_sessions SET revoked = true WHERE account_id = @Id",
                new { actor.Id }
            );
        if (scenario == "expired")
            context.Auth.Time.Advance(TimeSpan.FromDays(31));
        var csrf = (await caller.GetFromJsonAsync<CsrfDto>("/auth/csrf"))!;
        caller.DefaultRequestHeaders.Add(csrf.HeaderName, csrf.RequestToken);
        var path = $"/calendars/{calendar.Id}";

        // When calling both legacy routes and the new protected administration operations.
        var results = new[]
        {
            await caller.GetAsync(path),
            await caller.GetAsync("/calendars"),
            await caller.PostAsJsonAsync(
                "/calendars",
                new
                {
                    title = "No",
                    recipientId = context.Recipient.Id,
                    background = "woodland",
                }
            ),
            await caller.PutAsJsonAsync(path + "/doors/1", new { title = "No", text = "No" }),
            await caller.PutAsJsonAsync(path + "/layout", new { layout = "random" }),
        };

        // Then no operation grants calendar authority and every response is no-store.
        Assert.All(
            results,
            response =>
            {
                Assert.Equal(expected, response.StatusCode);
                Assert.True(response.Headers.CacheControl?.NoStore);
            }
        );
    }

    [Fact(
        DisplayName = "Given another administrator and recipient, When calendar IDs or assignments are manipulated, Then SQL ownership and recipient responsibility prevent access"
    )]
    public async Task CrossOwnerAndForeignRecipient()
    {
        // Given a calendar and another administrator with their own assigned user.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = (
            await (
                await context.CreateAsync(new { title = "Private" })
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        var other = await context.Auth.ProvisionAsync(AccountRoles.Administrator);
        var recipient = await context.Auth.ProvisionAsync(AccountRoles.User, other.Id);
        using var caller = await context.Auth.CreateAuthenticatedClientAsync(other);
        var path = $"/calendars/{calendar.Id}";

        // When trying to read/edit the foreign calendar or assign a foreign recipient.
        var read = await caller.GetAsync(path);
        var edit = await SendAsync(
            caller,
            HttpMethod.Put,
            path + "/doors/1",
            new { title = "Stolen", text = "Stolen" }
        );
        var layout = await SendAsync(
            caller,
            HttpMethod.Put,
            path + "/layout",
            new { layout = "random" }
        );
        var create = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/calendars",
            new
            {
                title = "Foreign",
                recipientId = recipient.Id,
                background = "woodland",
            }
        );
        var list = (await caller.GetFromJsonAsync<CalendarListDto>("/calendars"))!;

        // Then neither the aggregate nor its contents are disclosed or changed.
        Assert.Equal(HttpStatusCode.NotFound, read.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, edit.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, layout.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
        Assert.Empty(list.Calendars);
        Assert.Equal(0, list.TotalCount);
    }

    [Fact(
        DisplayName = "Given an owner session without CSRF headers, When a calendar write is attempted, Then antiforgery blocks every mutation"
    )]
    public async Task CsrfBlocksWrites()
    {
        // Given an owned calendar and the same session without an antiforgery token.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = (
            await (
                await context.CreateAsync(new { title = "CSRF" })
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        context.Client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");

        // When submitting creation, content and layout mutations without CSRF.
        var responses = new[]
        {
            await context.Client.PostAsJsonAsync(
                "/calendars",
                new
                {
                    title = "No",
                    recipientId = context.Recipient.Id,
                    background = "woodland",
                }
            ),
            await context.Client.PutAsJsonAsync(
                $"/calendars/{calendar.Id}/doors/1",
                new { title = "No", text = "No" }
            ),
            await context.Client.PutAsJsonAsync(
                $"/calendars/{calendar.Id}/layout",
                new { layout = "random" }
            ),
        };

        // Then all writes fail closed with protected errors.
        Assert.All(
            responses,
            response =>
            {
                Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
                Assert.True(response.Headers.CacheControl?.NoStore);
            }
        );
    }
}
