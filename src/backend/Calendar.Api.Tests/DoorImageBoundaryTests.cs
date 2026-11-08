using System.Net;
using System.Net.Http.Json;
using System.Text;
using Calendar.Api.Generated;
using Calendar.Api.Infrastructure;
using Npgsql;
using Xunit;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class DoorImageBoundaryTests(ApiFixture fixture)
{
    [Theory(
        DisplayName = "Given image data at a database boundary, When SQL bypasses application checks, Then only consistent bounded binary metadata is accepted"
    )]
    [InlineData(1_000_000, "image/png", 1600, true)]
    [InlineData(1_000_001, "image/png", 1600, false)]
    [InlineData(0, "image/png", 1, false)]
    [InlineData(1, "image/gif", 1, false)]
    [InlineData(1, null, 1, false)]
    [InlineData(1, "image/png", 0, false)]
    [InlineData(1, "image/png", 1601, false)]
    public async Task EnforcesDatabaseImageConstraints(
        int bytes,
        string? mediaType,
        int width,
        bool accepted
    )
    {
        // Given an owned calendar and parameters deliberately bypassing the image service.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await context.CreateCalendarAsync();
        var parameters = new
        {
            calendar.Id,
            Data = new byte[bytes],
            MediaType = mediaType,
            Width = width,
            Version = Guid.NewGuid(),
        };

        // When writing the exact binary and metadata boundary to PostgreSQL.
        var action = () =>
            context.Auth.ExecuteAsync(
                """
                UPDATE doors SET image_data = @Data, image_media_type = @MediaType,
                    image_width = @Width, image_height = 1, image_version = @Version
                WHERE calendar_id = @Id AND day_number = 1
                """,
                parameters
            );

        // Then the database independently protects storage consistency and the decimal MB boundary.
        if (accepted)
            Assert.Equal(1, await action());
        else
        {
            var error = await Assert.ThrowsAsync<PostgresException>(action);
            Assert.Equal(PostgresErrorCodes.CheckViolation, error.SqlState);
        }
    }

    [Fact(
        DisplayName = "Given a populated pre-image schema, When actual DbUp startup runs twice, Then existing content and settings survive with a stable image migration journal"
    )]
    public async Task PopulatedUpgradePreservesCalendar()
    {
        // Given populated calendar rows and the exact schema/journal before migration 0005.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await context.CreateCalendarAsync("Preserved calendar");
        await context.Client.PutAsJsonAsync(
            $"/calendars/{calendar.Id}/doors/24",
            new { title = "Saved title", text = "Saved\nmessage" }
        );
        await context.Auth.ExecuteAsync(
            """
            ALTER TABLE doors DROP CONSTRAINT doors_image_consistent,
                DROP COLUMN image_data, DROP COLUMN image_media_type, DROP COLUMN image_width,
                DROP COLUMN image_height, DROP COLUMN image_version;
            DELETE FROM schemaversions WHERE scriptname = 'Calendar.Api.Migrations.0005_add_door_images.sql';
            """
        );

        // When startup applies the embedded image migration, then restarts using its journal.
        await DatabaseStartup.MigrateAsync(
            context.Auth.ConnectionString,
            1,
            CancellationToken.None
        );
        await DatabaseStartup.MigrateAsync(
            context.Auth.ConnectionString,
            1,
            CancellationToken.None
        );
        var after = (
            await context.Client.GetFromJsonAsync<CalendarDto>($"/calendars/{calendar.Id}")
        )!;

        // Then no existing content/settings are backfilled or removed, and 0005 runs only once.
        Assert.All(after.Doors, door => Assert.Null(door.Image));
        Assert.Equal("Saved title", after.Doors.Last().Title);
        Assert.Equal("Saved\nmessage", after.Doors.Last().Text);
        Assert.Equal(calendar.OwnerId, after.OwnerId);
        Assert.Equal(calendar.RecipientId, after.RecipientId);
        Assert.Equal(calendar.Year, after.Year);
        Assert.Equal(calendar.Background, after.Background);
        Assert.Equal(calendar.DoorOrder, after.DoorOrder);
        Assert.Equal(
            6,
            await context.Auth.ScalarAsync<int>("SELECT count(*)::int FROM schemaversions")
        );
    }

    [Theory(
        DisplayName = "Given missing null or numeric image fields, When actual HTTP binding validates the body, Then presence and enums are enforced independently"
    )]
    [InlineData("\"imageAction\":null")]
    [InlineData("\"imageAction\":0")]
    [InlineData("\"imageData\":null")]
    public async Task InvalidHttpImageFields(string field)
    {
        // Given raw JSON that generated nullable CLR properties cannot distinguish alone.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await context.CreateCalendarAsync();
        using var body = new StringContent(
            "{\"title\":\"Draft\",\"text\":\"\"," + field + "}",
            Encoding.UTF8,
            "application/json"
        );

        // When direct HTTP binding and the contract presence filter run.
        var response = await context.Client.PutAsync($"/calendars/{calendar.Id}/doors/1", body);

        // Then invalid null/numeric values never reach storage.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(
            "",
            await context.Auth.ScalarAsync<string>(
                "SELECT content_title FROM doors WHERE calendar_id = @Id AND day_number = 1",
                new { calendar.Id }
            )
        );
    }

    [Theory(
        DisplayName = "Given an oversized request or decoded source, When directly posted to the backend, Then structured protected HTTP 413 prevents a write"
    )]
    [InlineData("body")]
    [InlineData("source")]
    public async Task RejectsOversizedHttpUpload(string boundary)
    {
        // Given an upload that exceeds either the raw body or decoded source limit.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await context.CreateCalendarAsync();
        var data =
            boundary == "body"
                ? new string('A', 14_000_001)
                : Convert.ToBase64String(new byte[10_000_001]);

        // When browser and BFF checks are bypassed.
        var response = await context.Client.PutAsJsonAsync(
            $"/calendars/{calendar.Id}/doors/1",
            new
            {
                title = "Draft",
                text = "",
                imageAction = "replace",
                imageData = data,
            }
        );

        // Then the independent backend returns an authored error and preserves saved state.
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.NotNull(await response.Content.ReadFromJsonAsync<ApiProblemDetails>());
        Assert.Equal(
            0,
            await context.Auth.ScalarAsync<int>(
                "SELECT count(*)::int FROM doors WHERE image_data IS NOT NULL"
            )
        );
    }
}
