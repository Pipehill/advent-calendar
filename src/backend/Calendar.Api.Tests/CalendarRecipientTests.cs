using System.Net;
using System.Net.Http.Json;
using Calendar.Api.Generated;
using Calendar.Api.Models;
using Calendar.Security;
using Dapper;
using Xunit;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class CalendarRecipientTests(ApiFixture fixture)
{
    [Fact(
        DisplayName = "Given an owned calendar, When its assigned recipient is changed, Then reads and lists show the new identity without changing its contents"
    )]
    public async Task UpdatesRecipientAndDisplayMetadata()
    {
        // Given two assigned users and a calendar with saved content and random layout.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var next = await context.Auth.ProvisionAsync(AccountRoles.User, context.Owner.Id);
        await context.Auth.ExecuteAsync(
            "UPDATE accounts SET name = @Name WHERE id = @Id",
            new { Name = "Ærlig Ørn 🎄", next.Id }
        );
        var created = await CreateCalendarAsync(context);
        await context.Client.PutAsJsonAsync(
            $"/calendars/{created.Id}/doors/24",
            new { title = "Gift", text = "Unchanged\ncontent" }
        );
        var before = (
            await (
                await context.Client.PutAsJsonAsync(
                    $"/calendars/{created.Id}/layout",
                    new { layout = "random" }
                )
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        context.Auth.Time.Advance(TimeSpan.FromMinutes(1));

        // When the owner explicitly saves another assigned recipient.
        var response = await context.Client.PutAsJsonAsync(
            $"/calendars/{created.Id}/recipient",
            new { recipientId = next.Id }
        );
        var updated = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        var read = (
            await context.Client.GetFromJsonAsync<CalendarDto>($"/calendars/{created.Id}")
        )!;
        var list = (await context.Client.GetFromJsonAsync<CalendarListDto>("/calendars"))!;

        // Then all read paths agree while calendar identity, content and order remain intact.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(context.Recipient.Username, created.RecipientName);
        Assert.Equal(context.Recipient.Username, created.RecipientUsername);
        Assert.Equal(next.Id, updated.RecipientId);
        Assert.Equal("Ærlig Ørn 🎄", updated.RecipientName);
        Assert.Equal(next.Username, updated.RecipientUsername);
        Assert.Equal(updated.RecipientName, read.RecipientName);
        var summary = Assert.Single(list.Calendars);
        Assert.Equal(next.Id, summary.RecipientId);
        Assert.Equal(updated.RecipientName, summary.RecipientName);
        Assert.Equal(next.Username, summary.RecipientUsername);
        Assert.Equal(before.OwnerId, updated.OwnerId);
        Assert.Equal(before.Id, updated.Id);
        Assert.Equal(before.Title, updated.Title);
        Assert.Equal(before.Year, updated.Year);
        Assert.Equal(before.Background, updated.Background);
        Assert.Equal(before.CreatedAt, updated.CreatedAt);
        Assert.True(updated.LastModifiedAt > before.LastModifiedAt);
        Assert.Equal(before.Layout, updated.Layout);
        Assert.Equal(before.DoorOrder, updated.DoorOrder);
        Assert.Equal(
            before.Doors.Select(door => (door.Number, door.Title, door.Text)),
            updated.Doors.Select(door => (door.Number, door.Title, door.Text))
        );
    }

    [Theory(
        DisplayName = "Given an ineligible calendar recipient, When the owner saves it, Then validation rejects the assignment and preserves the calendar"
    )]
    [InlineData("missing")]
    [InlineData("foreign")]
    [InlineData("administrator")]
    public async Task RejectsIneligibleRecipient(string scenario)
    {
        // Given a persisted assignment and a nonexistent, foreign or administrator target.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await CreateCalendarAsync(context);
        var other = await context.Auth.ProvisionAsync(AccountRoles.Administrator);
        var foreign = await context.Auth.ProvisionAsync(AccountRoles.User, other.Id);
        var target = scenario switch
        {
            "foreign" => foreign.Id,
            "administrator" => context.Owner.Id,
            _ => Guid.NewGuid(),
        };

        // When submitting a syntactically valid but ineligible recipient ID.
        var response = await context.Client.PutAsJsonAsync(
            $"/calendars/{calendar.Id}/recipient",
            new { recipientId = target }
        );
        var problem = (await response.Content.ReadFromJsonAsync<ApiProblemDetails>())!;
        var read = (
            await context.Client.GetFromJsonAsync<CalendarDto>($"/calendars/{calendar.Id}")
        )!;

        // Then structured validation protects the current assignment and modification time.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Contains("recipientId", problem.Errors.Keys);
        Assert.Equal(calendar.RecipientId, read.RecipientId);
        Assert.Equal(calendar.LastModifiedAt, read.LastModifiedAt);
    }

    [Theory(
        DisplayName = "Given malformed recipient input, When the direct update endpoint is called, Then contract validation rejects the request"
    )]
    [InlineData("{}")]
    [InlineData("{\"recipientId\":null}")]
    [InlineData("{\"recipientId\":\"invalid\"}")]
    [InlineData(
        "{\"recipientId\":\"00000000-0000-0000-0000-000000000001\",\"ownerId\":\"forged\"}"
    )]
    public async Task RejectsMalformedInput(string json)
    {
        // Given a valid owner session and a malformed raw request body.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await CreateCalendarAsync(context);
        using var body = new StringContent(json, System.Text.Encoding.UTF8, "application/json");

        // When bypassing browser and BFF validation.
        var response = await context.Client.PutAsync($"/calendars/{calendar.Id}/recipient", body);

        // Then no malformed assignment reaches persistence.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(
            calendar.RecipientId,
            await context.Auth.ScalarAsync<Guid>(
                "SELECT recipient_id FROM calendars WHERE id = @Id",
                new { calendar.Id }
            )
        );
    }

    [Theory(
        DisplayName = "Given a concurrent security change, When a recipient update commits, Then it rechecks current actor and recipient authority"
    )]
    [InlineData("actor")]
    [InlineData("recipient")]
    public async Task RechecksConcurrentSecurityChanges(string scenario)
    {
        // Given a saved calendar and an independently held security transaction lock.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await CreateCalendarAsync(context);
        var next = await context.Auth.ProvisionAsync(AccountRoles.User, context.Owner.Id);
        await using var security = new CalendarSecurityScope(context);
        await security.AcquireAsync();

        // When a queued update runs after a committed actor disablement or recipient promotion.
        var update = security.Service.SaveRecipientAsync(
            security.Identity,
            calendar.Id,
            next.Id,
            CancellationToken.None
        );
        await security.Connection.ExecuteAsync(
            scenario == "actor"
                ? "UPDATE accounts SET enabled = false WHERE id = @Id"
                : "UPDATE accounts SET account_role = 'calendarAdmin' WHERE id = @Id",
            new { Id = scenario == "actor" ? context.Owner.Id : next.Id },
            security.Transaction
        );
        await security.Transaction.CommitAsync();
        var action = () => update;

        // Then stale authority cannot change the persisted recipient.
        await Assert.ThrowsAsync<AccountFailureException>(action);
        Assert.Equal(
            calendar.RecipientId,
            await context.Auth.ScalarAsync<Guid>(
                "SELECT recipient_id FROM calendars WHERE id = @Id",
                new { calendar.Id }
            )
        );
    }

    private static async Task<CalendarDto> CreateCalendarAsync(CalendarTestContext context) =>
        (
            await (
                await context.CreateAsync(new { title = "Recipient selection" })
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
}
