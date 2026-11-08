using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Calendar.Api.Generated;
using Calendar.Security;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class SystemCalendarTests(ApiFixture fixture)
{
    [Fact(
        DisplayName = "Given calendars across owners with duplicate Unicode names, When superadmin paginates, Then stored identities and stable totals survive account changes"
    )]
    public async Task ListsStoredAssociationsAcrossOwners()
    {
        // Given three calendars across two owners, with equal creation times and duplicate names.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var first = await CreateCalendarAsync(context);
        var second = await CreateCalendarAsync(context);
        var other = await context.Auth.ProvisionAsync(AccountRoles.Administrator);
        var recipient = await context.Auth.ProvisionAsync(AccountRoles.User, other.Id);
        using var ownerClient = await context.Auth.CreateAuthenticatedClientAsync(other);
        var third = (
            await (
                await SendAsync(
                    ownerClient,
                    HttpMethod.Post,
                    "/calendars",
                    new
                    {
                        title = "Another owner's calendar",
                        recipientId = recipient.Id,
                        background = "aurora",
                    }
                )
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        await context.Auth.ExecuteAsync(
            "UPDATE accounts SET name = @Name",
            new { Name = "Ørn 🎄" }
        );
        await context.Auth.ExecuteAsync(
            "UPDATE accounts SET enabled = false, account_role = 'calendarAdmin' WHERE id = @Id",
            new { recipient.Id }
        );
        await context.Auth.ExecuteAsync(
            "UPDATE accounts SET enabled = false WHERE id = @Id",
            new { other.Id }
        );
        var superadmin = await context.Auth.ProvisionAsync();
        using var caller = await context.Auth.CreateAuthenticatedClientAsync(superadmin);
        var expected = new[] { first.Id, second.Id, third.Id }.Order().ToArray();

        // When paging through all calendars, including an empty out-of-range page.
        var page = (
            await caller.GetFromJsonAsync<SystemCalendarListDto>(
                "/administration/calendars?limit=2"
            )
        )!;
        var last = (
            await caller.GetFromJsonAsync<SystemCalendarListDto>(
                "/administration/calendars?offset=2&limit=2"
            )
        )!;
        var beyond = (
            await caller.GetFromJsonAsync<SystemCalendarListDto>(
                "/administration/calendars?offset=99&limit=2"
            )
        )!;
        var rows = page.Calendars.Concat(last.Calendars).ToArray();

        // Then paging is deterministic and joins use the calendar's persisted associations.
        Assert.Equal(expected, rows.Select(row => row.Id));
        Assert.Equal(2, page.Calendars.Count);
        Assert.Single(last.Calendars);
        Assert.Empty(beyond.Calendars);
        Assert.All(new[] { page, last, beyond }, result => Assert.Equal(3, result.TotalCount));
        var changed = Assert.Single(rows, row => row.Id == third.Id);
        Assert.Equal(other.Id, changed.OwnerId);
        Assert.Equal(other.Username, changed.OwnerUsername);
        Assert.Equal(recipient.Id, changed.RecipientId);
        Assert.Equal(recipient.Username, changed.RecipientUsername);
        Assert.All(
            rows,
            row =>
            {
                Assert.Equal("Ørn 🎄", row.OwnerName);
                Assert.Equal("Ørn 🎄", row.RecipientName);
            }
        );
        var json = JsonSerializer.Serialize(page);
        Assert.DoesNotContain("doors", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("password", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("securityVersion", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact(
        DisplayName = "Given no calendars, When superadmin lists them, Then an empty protected page is returned"
    )]
    public async Task EmptyList()
    {
        // Given an unrestricted superadmin and no calendars.
        await using var context = await AuthTestContext.CreateAsync(fixture);
        await context.LoginAsync(await context.ProvisionAsync());

        // When reading the system overview.
        var response = await context.Client.GetAsync("/administration/calendars");
        var page = (await response.Content.ReadFromJsonAsync<SystemCalendarListDto>())!;

        // Then the response contains an explicit empty result without shared caching.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(0, page.TotalCount);
        Assert.Empty(page.Calendars);
    }

    [Fact(
        DisplayName = "Given a prepared calendar, When superadmin previews and attempts writes, Then every door is readable and persisted data remains unchanged"
    )]
    public async Task PreviewIsReadOnly()
    {
        // Given a saved random layout and distinct content in all doors before December.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await CreateCalendarAsync(context);
        await context.Auth.ExecuteAsync(
            "UPDATE doors SET content_title = 'Gift ' || day_number, content_text = 'Future ' || day_number WHERE calendar_id = @Id",
            new { calendar.Id }
        );
        var before = (
            await (
                await SendAsync(
                    context.Client,
                    HttpMethod.Put,
                    $"/calendars/{calendar.Id}/layout",
                    new { layout = "random" }
                )
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        using var caller = await context.Auth.CreateAuthenticatedClientAsync(
            await context.Auth.ProvisionAsync()
        );
        context.Auth.Time.Advance(TimeSpan.FromSeconds(1));

        // When superadmin previews twice and crafts all owner mutations with valid CSRF.
        var preview = await caller.GetAsync($"/administration/calendars/{calendar.Id}/preview");
        var read = (await preview.Content.ReadFromJsonAsync<CalendarDto>())!;
        var repeated = (
            await caller.GetFromJsonAsync<CalendarDto>(
                $"/administration/calendars/{calendar.Id}/preview"
            )
        )!;
        var writes = new[]
        {
            await SendAsync(
                caller,
                HttpMethod.Post,
                "/calendars",
                new
                {
                    title = "No",
                    recipientId = context.Recipient.Id,
                    background = "woodland",
                }
            ),
            await SendAsync(
                caller,
                HttpMethod.Put,
                $"/calendars/{calendar.Id}/doors/24",
                new { title = "No", text = "No" }
            ),
            await SendAsync(
                caller,
                HttpMethod.Put,
                $"/calendars/{calendar.Id}/layout",
                new { layout = "chronological" }
            ),
            await SendAsync(
                caller,
                HttpMethod.Put,
                $"/calendars/{calendar.Id}/recipient",
                new { recipientId = context.Recipient.Id }
            ),
        };
        var after = (
            await context.Client.GetFromJsonAsync<CalendarDto>($"/calendars/{calendar.Id}")
        )!;

        // Then full content is available without changing state or granting owner access.
        Assert.True(preview.Headers.CacheControl?.NoStore);
        Assert.Equal(JsonSerializer.Serialize(before), JsonSerializer.Serialize(read));
        Assert.Equal(JsonSerializer.Serialize(before), JsonSerializer.Serialize(repeated));
        Assert.Equal(JsonSerializer.Serialize(before), JsonSerializer.Serialize(after));
        Assert.Equal(24, read.Doors.Count);
        Assert.Equal("Future 24", read.Doors.Last().Text);
        Assert.All(
            writes,
            response =>
            {
                Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
                Assert.True(response.Headers.CacheControl?.NoStore);
            }
        );
        Assert.Equal(1, await context.Auth.ScalarAsync<int>("SELECT count(*)::int FROM calendars"));
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await caller.GetAsync($"/calendars/{calendar.Id}")).StatusCode
        );
    }

    [Theory(
        DisplayName = "Given a caller without current unrestricted superadmin authority, When system reads are requested, Then list and preview fail closed with no-store"
    )]
    [InlineData("anonymous", HttpStatusCode.Unauthorized)]
    [InlineData("calendarAdmin", HttpStatusCode.Forbidden)]
    [InlineData("calendarUser", HttpStatusCode.Forbidden)]
    [InlineData("restricted", HttpStatusCode.Forbidden)]
    [InlineData("disabled", HttpStatusCode.Unauthorized)]
    [InlineData("revoked", HttpStatusCode.Unauthorized)]
    [InlineData("expired", HttpStatusCode.Unauthorized)]
    [InlineData("version", HttpStatusCode.Unauthorized)]
    [InlineData("demoted", HttpStatusCode.Forbidden)]
    public async Task DeniesInvalidAuthority(string scenario, HttpStatusCode expected)
    {
        // Given an existing calendar and a caller whose authority is independently changed.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await CreateCalendarAsync(context);
        using var caller = context.Application.CreateClient();
        var actor = scenario switch
        {
            "calendarAdmin" => context.Owner,
            "calendarUser" => context.Recipient,
            _ => await context.Auth.ProvisionAsync(),
        };
        if (scenario != "anonymous")
            await context.Auth.LoginAsync(actor, caller);
        var sql = scenario switch
        {
            "restricted" =>
                "UPDATE account_sessions SET is_restricted = true WHERE account_id = @Id",
            "disabled" => "UPDATE accounts SET enabled = false WHERE id = @Id",
            "revoked" => "UPDATE account_sessions SET revoked = true WHERE account_id = @Id",
            "version" => "UPDATE accounts SET security_version = @Version WHERE id = @Id",
            "demoted" => "UPDATE accounts SET account_role = 'calendarAdmin' WHERE id = @Id",
            _ => null,
        };
        if (sql is not null)
            await context.Auth.ExecuteAsync(sql, new { actor.Id, Version = Guid.NewGuid() });
        if (scenario == "expired")
            context.Auth.Time.Advance(TimeSpan.FromDays(31));

        // When requesting the list, an existing preview and an unknown preview directly.
        var responses = new[]
        {
            await caller.GetAsync("/administration/calendars"),
            await caller.GetAsync($"/administration/calendars/{calendar.Id}/preview"),
            await caller.GetAsync($"/administration/calendars/{Guid.NewGuid()}/preview"),
        };

        // Then authorization precedes resource lookup and no protected data is returned.
        Assert.All(
            responses,
            response =>
            {
                Assert.Equal(expected, response.StatusCode);
                Assert.True(response.Headers.CacheControl?.NoStore);
            }
        );
    }

    [Theory(
        DisplayName = "Given invalid system calendar query parameters, When superadmin requests them, Then the contract boundary rejects them with no-store"
    )]
    [InlineData("?offset=-1")]
    [InlineData("?offset=1000001")]
    [InlineData("?offset=abc")]
    [InlineData("?limit=0")]
    [InlineData("?limit=101")]
    [InlineData("?limit=1.5")]
    [InlineData("/not-a-uuid/preview")]
    public async Task RejectsMalformedInputs(string suffix)
    {
        // Given a current superadmin and malformed paging or UUID input.
        await using var context = await AuthTestContext.CreateAsync(fixture);
        await context.LoginAsync(await context.ProvisionAsync());

        // When bypassing frontend validation.
        var response = await context.Client.GetAsync("/administration/calendars" + suffix);

        // Then the API independently rejects the input without caching its error.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
    }

    [Fact(
        DisplayName = "Given a missing calendar, When an authorized superadmin previews it, Then a protected not-found response is returned"
    )]
    public async Task MissingPreview()
    {
        // Given an unrestricted superadmin and an unknown calendar ID.
        await using var context = await AuthTestContext.CreateAsync(fixture);
        await context.LoginAsync(await context.ProvisionAsync());

        // When requesting its full preview.
        var response = await context.Client.GetAsync(
            $"/administration/calendars/{Guid.NewGuid()}/preview"
        );

        // Then authorized lookup returns the ordinary no-store not-found response.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
    }

    private static async Task<CalendarDto> CreateCalendarAsync(CalendarTestContext context) =>
        (
            await (
                await context.CreateAsync(new { title = "Jul 🎄" })
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
}
