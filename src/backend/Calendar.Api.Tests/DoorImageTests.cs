using System.Net;
using System.Net.Http.Json;
using Calendar.Api.Generated;
using Calendar.Security;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class DoorImageTests(ApiFixture fixture)
{
    [Fact(
        DisplayName = "Given an owned door, When its image is added kept replaced and removed, Then text image and modification time commit together"
    )]
    public async Task CommonSaveLifecycle()
    {
        // Given an owned calendar without images.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await context.CreateCalendarAsync("Images");
        var path = $"/calendars/{calendar.Id}/doors/7";
        var data = Convert.ToBase64String(DoorImageFixtures.Create());

        // When an image-only draft is explicitly saved and read separately.
        var saved = await context.Client.PutAsJsonAsync(
            path,
            new
            {
                title = "",
                text = "",
                imageAction = "replace",
                imageData = data,
            }
        );
        var first = (await saved.Content.ReadFromJsonAsync<CalendarDto>())!;
        var imageResponse = await context.Client.GetAsync(path + "/image");
        var image = (await imageResponse.Content.ReadFromJsonAsync<DoorImageDto>())!;

        // Then detail responses expose metadata only and storage is a binary value.
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.True(imageResponse.Headers.CacheControl?.NoStore);
        Assert.Equal(
            first.Doors.Single(door => door.Number == 7).Image!.Version,
            image.Metadata.Version
        );
        Assert.DoesNotContain(
            image.Data,
            await saved.Content.ReadAsStringAsync(),
            StringComparison.Ordinal
        );
        Assert.Equal(
            "bytea",
            await context.Auth.ScalarAsync<string>(
                "SELECT pg_typeof(image_data)::text FROM doors WHERE calendar_id = @Id AND day_number = 7",
                new { calendar.Id }
            )
        );
        Assert.All(first.Doors.Where(door => door.Number != 7), door => Assert.Null(door.Image));

        // When a text-only save omits the image action.
        context.Auth.Time.Advance(TimeSpan.FromSeconds(1));
        var kept = (
            await (
                await context.Client.PutAsJsonAsync(
                    path,
                    new { title = "Plain <b>title</b>", text = "Line one\nLine two" }
                )
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        var keptImage = (await context.Client.GetFromJsonAsync<DoorImageDto>(path + "/image"))!;

        // Then saved image bytes and version survive unchanged.
        Assert.Equal(image.Data, keptImage.Data);
        Assert.Equal(image.Metadata.Version, keptImage.Metadata.Version);
        Assert.True(kept.LastModifiedAt > first.LastModifiedAt);

        // When replacement is saved and the image is subsequently removed.
        var replaced = (
            await (
                await context.Client.PutAsJsonAsync(
                    path,
                    new
                    {
                        title = "Gift",
                        text = "Message",
                        imageAction = "replace",
                        imageData = data,
                    }
                )
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        var removed = (
            await (
                await context.Client.PutAsJsonAsync(
                    path,
                    new
                    {
                        title = "Gift",
                        text = "Message",
                        imageAction = "remove",
                    }
                )
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        var absent = await context.Client.GetAsync(path + "/image");

        // Then replacement advances version and removal preserves text and all other doors/settings.
        Assert.NotEqual(
            image.Metadata.Version,
            replaced.Doors.Single(door => door.Number == 7).Image!.Version
        );
        var door = removed.Doors.Single(door => door.Number == 7);
        Assert.Null(door.Image);
        Assert.Equal("Gift", door.Title);
        Assert.Equal("Message", door.Text);
        Assert.Equal(HttpStatusCode.NotFound, absent.StatusCode);
        Assert.Equal(calendar.DoorOrder, removed.DoorOrder);
        Assert.Equal(calendar.RecipientId, removed.RecipientId);
        Assert.Equal(calendar.Year, removed.Year);
    }

    [Theory(
        DisplayName = "Given invalid image fields, When saving through HTTP, Then saved text image and modification time remain unchanged"
    )]
    [InlineData("replace", null)]
    [InlineData("replace", "")]
    [InlineData("replace", "%%%")]
    [InlineData("keep", "AA==")]
    [InlineData("remove", "AA==")]
    [InlineData("unknown", null)]
    public async Task FailedSavePreservesContent(string action, string? data)
    {
        // Given saved text whose modification time must survive rejected updates.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await context.CreateCalendarAsync("Preserve");
        var path = $"/calendars/{calendar.Id}/doors/1";
        var before = (
            await (
                await context.Client.PutAsJsonAsync(
                    path,
                    new { title = "Saved", text = "Original" }
                )
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        var fields = new Dictionary<string, object?>
        {
            ["title"] = "Unsaved",
            ["text"] = "Changed",
            ["imageAction"] = action,
        };
        if (data is not null)
            fields["imageData"] = data;
        context.Auth.Time.Advance(TimeSpan.FromSeconds(1));

        // When the direct backend receives invalid action/data combinations.
        var response = await context.Client.PutAsJsonAsync(path, fields);
        var after = (
            await context.Client.GetFromJsonAsync<CalendarDto>($"/calendars/{calendar.Id}")
        )!;

        // Then no part of the draft commits.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(before.LastModifiedAt, after.LastModifiedAt);
        Assert.Equal("Saved", after.Doors.First().Title);
        Assert.Equal("Original", after.Doors.First().Text);
        Assert.Null(after.Doors.First().Image);
    }

    [Fact(
        DisplayName = "Given an owner image, When superadmin uses dedicated preview, Then the image is readable but owner reads and writes remain forbidden"
    )]
    public async Task SuperadminImageAuthorityIsReadOnly()
    {
        // Given an owner image and a separate current superadmin.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await context.CreateCalendarAsync("Protected");
        var path = $"/calendars/{calendar.Id}/doors/2";
        var save = await context.Client.PutAsJsonAsync(
            path,
            new
            {
                title = "",
                text = "",
                imageAction = "replace",
                imageData = Convert.ToBase64String(DoorImageFixtures.Create()),
            }
        );
        using var superadmin = await context.Auth.CreateAuthenticatedClientAsync(
            await context.Auth.ProvisionAsync()
        );

        // When the superadmin reads through dedicated authority and attempts owner operations.
        var preview = await superadmin.GetAsync(
            $"/administration/calendars/{calendar.Id}/preview/doors/2/image"
        );
        var ownerRead = await superadmin.GetAsync(path + "/image");
        var write = await SendAsync(
            superadmin,
            HttpMethod.Put,
            path,
            new
            {
                title = "Changed",
                text = "",
                imageAction = "remove",
            }
        );

        // Then explicit preview grants no owner authority.
        Assert.Equal(HttpStatusCode.OK, save.StatusCode);
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        Assert.True(preview.Headers.CacheControl?.NoStore);
        Assert.Equal(HttpStatusCode.Forbidden, ownerRead.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, write.StatusCode);
    }

    [Theory(
        DisplayName = "Given a protected image path, When an excluded actor guesses it, Then independent authorization denies both image authorities"
    )]
    [InlineData("anonymous", 401, 401)]
    [InlineData("other-owner", 404, 403)]
    [InlineData("user", 403, 403)]
    [InlineData("restricted", 403, 403)]
    [InlineData("revoked", 401, 401)]
    public async Task DeniesExcludedActors(string actor, int ownerStatus, int systemStatus)
    {
        // Given a calendar and an actor without its image authority.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await context.CreateCalendarAsync("Hidden");
        using var caller = context.Application.CreateClient();
        if (actor != "anonymous")
        {
            var account =
                actor == "user"
                    ? context.Recipient
                    : await context.Auth.ProvisionAsync(AccountRoles.Administrator);
            if (actor == "restricted")
                await context.Auth.ExecuteAsync(
                    "UPDATE accounts SET must_change_password = true, temporary_password_expires_at = now() + interval '30 minutes' WHERE id = @Id",
                    new { account.Id }
                );
            await context.Auth.LoginAsync(account, caller);
            if (actor == "revoked")
                await context.Auth.ExecuteAsync(
                    "UPDATE account_sessions SET revoked = true WHERE account_id = @Id",
                    new { account.Id }
                );
        }

        // When guessing both owner and system image routes.
        var owner = await caller.GetAsync($"/calendars/{calendar.Id}/doors/1/image");
        var system = await caller.GetAsync(
            $"/administration/calendars/{calendar.Id}/preview/doors/1/image"
        );

        // Then neither endpoint leaks content, including error responses.
        Assert.Equal(ownerStatus, (int)owner.StatusCode);
        Assert.Equal(systemStatus, (int)system.StatusCode);
        Assert.True(owner.Headers.CacheControl?.NoStore);
        Assert.True(system.Headers.CacheControl?.NoStore);
    }
}
