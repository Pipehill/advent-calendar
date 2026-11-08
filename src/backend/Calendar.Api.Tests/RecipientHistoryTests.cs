using System.Net;
using System.Net.Http.Json;
using Calendar.Api.Generated;
using Calendar.Security;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class RecipientHistoryTests(ApiFixture fixture)
{
    [Fact(
        DisplayName = "Given two recipient devices, When a door is opened concurrently and reopened after login, Then one first timestamp survives without modifying the calendar"
    )]
    public async Task FirstOpeningSurvivesDevicesAndLogin()
    {
        // Given a populated calendar, two devices and no read-created history.
        await using var context = await RecipientTestContext.CreateAsync(fixture);
        await context.PopulateAsync();
        using var other = await context.Auth.CreateAuthenticatedClientAsync(
            context.Calendar.Recipient
        );
        var modified = context.Saved.LastModifiedAt;
        await context.Client.GetAsync(context.Path);
        Assert.Equal(0, await context.HistoryCountAsync());

        // When two explicit opens race and another login later reopens the same door.
        var responses = await Task.WhenAll(
            SendAsync(context.Client, HttpMethod.Post, context.Path + "/doors/1/open"),
            SendAsync(other, HttpMethod.Post, context.Path + "/doors/1/open")
        );
        var first = (await responses[0].Content.ReadFromJsonAsync<RecipientOpeningDto>())!;
        context.Auth.Time.Advance(TimeSpan.FromMinutes(1));
        await SendAsync(other, HttpMethod.Post, "/auth/logout");
        await context.Auth.LoginAsync(context.Calendar.Recipient, other);
        var reopened = await SendAsync(other, HttpMethod.Post, context.Path + "/doors/1/open");
        var result = (await reopened.Content.ReadFromJsonAsync<RecipientOpeningDto>())!;
        var board = (await other.GetFromJsonAsync<RecipientCalendarDto>(context.Path))!;

        // Then the first-open timestamp is stable across sessions/devices and content modification time is untouched.
        Assert.All(responses, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        Assert.Equal(1, await context.HistoryCountAsync());
        Assert.Equal(first.OpenedAt, result.OpenedAt);
        Assert.Equal(first.OpenedAt, board.Doors[0].OpenedAt);
        Assert.Equal(modified, board.LastModifiedAt);
        Assert.Equal(modified, result.LastModifiedAt);
    }

    [Fact(
        DisplayName = "Given a previously opened door, When its content becomes empty, Then current opening is denied without erasing history"
    )]
    public async Task EmptyingContentKeepsHistoryWithoutAuthority()
    {
        // Given an explicitly opened populated door.
        await using var context = await RecipientTestContext.CreateAsync(fixture);
        await context.PopulateAsync();
        await SendAsync(context.Client, HttpMethod.Post, context.Path + "/doors/1/open");

        // When an administrator empties the door and the recipient reads/reopens it.
        await context.PopulateAsync(1, " \t", "\r\n");
        var board = (await context.Client.GetFromJsonAsync<RecipientCalendarDto>(context.Path))!;
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            context.Path + "/doors/1/open"
        );

        // Then saved opening history is independent of current content permission.
        Assert.Equal(RecipientDoorDtoState.Empty, board.Doors[0].State);
        Assert.NotNull(board.Doors[0].OpenedAt);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(1, await context.HistoryCountAsync());
    }

    [Fact(
        DisplayName = "Given an opened assigned calendar, When its recipient changes, Then access and personal opening history follow the current assignment"
    )]
    public async Task ReassignmentIsolatesPersonalHistory()
    {
        // Given a saved personal opening and another eligible recipient.
        await using var context = await RecipientTestContext.CreateAsync(fixture);
        await context.PopulateAsync(image: true);
        await SendAsync(context.Client, HttpMethod.Post, context.Path + "/doors/1/open");
        var next = await context.Auth.ProvisionAsync(AccountRoles.User, context.Calendar.Owner.Id);

        // When assignment changes and each recipient attempts to read the calendar.
        await context.Auth.ExecuteAsync(
            "UPDATE calendars SET recipient_id = @Recipient WHERE id = @Id",
            new { Recipient = next.Id, context.Saved.Id }
        );
        using var nextClient = await context.Auth.CreateAuthenticatedClientAsync(next);
        var former = await context.Client.GetAsync(context.Path);
        var formerOpen = await SendAsync(
            context.Client,
            HttpMethod.Post,
            context.Path + "/doors/1/open"
        );
        var formerImage = await context.Client.GetAsync(
            $"{context.Path}/doors/1/image?version={context.ImageVersion}"
        );
        var current = (await nextClient.GetFromJsonAsync<RecipientCalendarDto>(context.Path))!;
        var formerList = (
            await context.Client.GetFromJsonAsync<RecipientCalendarListDto>("/recipient/calendars")
        )!;

        // Then the former recipient has no authority and the new one cannot see their opening history.
        Assert.Equal(HttpStatusCode.NotFound, former.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, formerOpen.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, formerImage.StatusCode);
        Assert.All(current.Doors, door => Assert.Null(door.OpenedAt));
        Assert.Empty(formerList.Calendars);
        Assert.Equal(1, await context.HistoryCountAsync());
    }
}
