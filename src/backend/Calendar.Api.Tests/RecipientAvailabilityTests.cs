using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Calendar.Api.Generated;
using Calendar.Api.Infrastructure;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class RecipientAvailabilityTests(ApiFixture fixture)
{
    [Theory(
        DisplayName = "Given a populated saved door and backend clock, When opening directly, Then Oslo availability controls content and history"
    )]
    [InlineData("2026-11-30T23:00:00Z", 1, false)]
    [InlineData("2026-12-01T05:59:59.9999999Z", 1, false)]
    [InlineData("2026-12-01T06:00:00Z", 1, true)]
    [InlineData("2026-12-01T06:00:00.0000001Z", 1, true)]
    [InlineData("2026-12-24T05:59:59Z", 24, false)]
    [InlineData("2026-12-24T06:00:00Z", 24, true)]
    [InlineData("2027-01-20T00:00:00Z", 1, true)]
    public async Task ServerEnforcesOpening(string instant, int number, bool available)
    {
        // Given a saved populated door and an independently authenticated recipient.
        await using var context = await RecipientTestContext.CreateAsync(fixture, instant);
        await context.PopulateAsync(number, image: true);

        // When the board and direct open/image endpoints are requested.
        var boardResponse = await context.Client.GetAsync(context.Path);
        var json = await boardResponse.Content.ReadAsStringAsync();
        var board = JsonSerializer.Deserialize<RecipientCalendarDto>(json)!;
        var opened = await SendAsync(
            context.Client,
            HttpMethod.Post,
            $"{context.Path}/doors/{number}/open"
        );
        var image = await context.Client.GetAsync(
            $"{context.Path}/doors/{number}/image?version={context.ImageVersion}"
        );

        // Then board payloads have only safe states and direct content follows the inclusive backend boundary.
        Assert.Equal(HttpStatusCode.OK, boardResponse.StatusCode);
        Assert.DoesNotContain("Secret", json, StringComparison.Ordinal);
        Assert.DoesNotContain("image", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("recipientId", json, StringComparison.Ordinal);
        Assert.Equal(
            new DateOnly(2026, 12, number),
            board.Doors.Single(door => door.Number == number).Date
        );
        Assert.All(board.Doors, door => Assert.Null(door.OpenedAt));
        Assert.Equal(available ? HttpStatusCode.OK : HttpStatusCode.Conflict, opened.StatusCode);
        Assert.Equal(available ? HttpStatusCode.OK : HttpStatusCode.Conflict, image.StatusCode);
        Assert.True(boardResponse.Headers.CacheControl?.NoStore);
        Assert.True(opened.Headers.CacheControl?.NoStore);
        Assert.True(image.Headers.CacheControl?.NoStore);
        Assert.Equal(available ? 1 : 0, await context.HistoryCountAsync());
    }

    [Theory(
        DisplayName = "Given independent content fields, When an available door is opened, Then empty and whitespace doors cannot create history"
    )]
    [InlineData("", "", false, false, false)]
    [InlineData(" \t", "\r\n\u00a0", false, false, false)]
    [InlineData("", "", false, true, false)]
    [InlineData(" \t", "\r\n", false, true, false)]
    [InlineData("Title", "", false, false, true)]
    [InlineData("", "Message", false, false, true)]
    [InlineData("", "", true, false, true)]
    [InlineData("", "", true, true, true)]
    [InlineData("Title", "Message", true, true, true)]
    public async Task NonemptyContent(
        string title,
        string text,
        bool image,
        bool bypass,
        bool available
    )
    {
        // Given independent content with either normal time or explicit local bypass.
        await using var context = await RecipientTestContext.CreateAsync(
            fixture,
            bypass ? "2026-11-01T00:00:00Z" : "2026-12-24T06:00:00Z",
            bypass
        );
        await context.PopulateAsync(24, title, text, image);

        // When a direct opening is attempted.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            context.Path + "/doors/24/open"
        );

        // Then any independent content suffices and empty doors remain denied under bypass.
        Assert.Equal(available ? HttpStatusCode.OK : HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(available ? 1 : 0, await context.HistoryCountAsync());
        if (available)
        {
            var result = (await response.Content.ReadFromJsonAsync<RecipientOpeningDto>())!;
            Assert.Equal(title, result.Door.Title);
            Assert.Equal(text, result.Door.Text);
        }
    }

    [Fact(
        DisplayName = "Given persisted local future-opening history, When enforcement resumes and migrations restart, Then history grants no time or image authority"
    )]
    public async Task BypassHistoryNeverUnlocksFutureContent()
    {
        // Given an actual Development host with bypass and future image-only content.
        await using var context = await RecipientTestContext.CreateAsync(
            fixture,
            "2026-11-01T00:00:00Z",
            true
        );
        await context.PopulateAsync(24, "", "", true);
        var first = await SendAsync(
            context.Client,
            HttpMethod.Post,
            context.Path + "/doors/24/open"
        );
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        // When the same migrated database and persisted session are read by a normal host.
        await DatabaseStartup.MigrateAsync(
            context.Auth.ConnectionString,
            1,
            CancellationToken.None
        );
        using var normal = fixture.Application(
            "Testing",
            context.Auth.ConnectionString,
            context.Auth.Time
        );
        using var client = normal.CreateClient();
        await context.Auth.LoginAsync(context.Calendar.Recipient, client);
        var board = (await client.GetFromJsonAsync<RecipientCalendarDto>(context.Path))!;
        var denied = await SendAsync(client, HttpMethod.Post, context.Path + "/doors/24/open");
        var image = await client.GetAsync(
            $"{context.Path}/doors/24/image?version={context.ImageVersion}"
        );

        // Then first-open history survives while every current content read remains time-locked.
        Assert.NotNull(board.Doors[23].OpenedAt);
        Assert.Equal(RecipientDoorDtoState.Locked, board.Doors[23].State);
        Assert.Equal(HttpStatusCode.Conflict, denied.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, image.StatusCode);
        Assert.Equal(1, await context.HistoryCountAsync());
    }

    [Theory(
        DisplayName = "Given enabled bypass outside Development and an unreachable database, When the host starts, Then configuration fails before database startup"
    )]
    [InlineData("Production")]
    [InlineData("Staging")]
    [InlineData("Testing")]
    public void StartupRejectsNonlocalBypass(string environment)
    {
        // Given invalid nonlocal bypass and a database that must never be contacted.
        using var app = fixture.Application(
            environment,
            "Host=invalid;Database=invalid",
            noTimeCheck: true
        );

        // When startup is requested.
        var start = () => app.CreateClient();

        // Then the option is rejected before migration/connection failures.
        var error = Assert.Throws<InvalidOperationException>(start);
        Assert.Contains("only be disabled in Development", error.Message, StringComparison.Ordinal);
    }
}
