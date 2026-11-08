using System.Globalization;
using Calendar.Api.Generated;

namespace Calendar.Api.Tests;

internal sealed class RecipientTestContext(
    CalendarTestContext calendar,
    CalendarDto saved,
    HttpClient client
) : IAsyncDisposable
{
    public CalendarTestContext Calendar => calendar;
    public AuthTestContext Auth => calendar.Auth;
    public CalendarDto Saved => saved;
    public HttpClient Client => client;
    public string Path => $"/recipient/calendars/{saved.Id}";
    public Guid ImageVersion { get; } = Guid.NewGuid();

    public static async Task<RecipientTestContext> CreateAsync(
        ApiFixture fixture,
        string instant = "2026-12-24T06:00:00Z",
        bool bypass = false
    )
    {
        var calendar = await CalendarTestContext.CreateAsync(
            fixture,
            environment: bypass ? "Development" : "Testing",
            noTimeCheck: bypass
        );
        var saved = await calendar.CreateCalendarAsync("Recipient calendar");
        await calendar.Auth.ExecuteAsync(
            "UPDATE calendars SET calendar_year = 2026 WHERE id = @Id",
            new { saved.Id }
        );
        var now = DateTimeOffset.Parse(instant, CultureInfo.InvariantCulture);
        calendar.Auth.Time.Advance(now - calendar.Auth.Time.GetUtcNow());
        var client = await calendar.Auth.CreateAuthenticatedClientAsync(calendar.Recipient);
        return new(calendar, saved, client);
    }

    public Task<int> PopulateAsync(
        int number = 1,
        string title = "Secret <b>gift</b>",
        string text = "Line one\nLine two",
        bool image = false
    ) =>
        Auth.ExecuteAsync(
            """
            UPDATE doors SET content_title = @Title, content_text = @Text,
                image_data = @Data, image_media_type = @MediaType, image_width = @Width,
                image_height = @Height, image_version = @Version
            WHERE calendar_id = @Id AND day_number = @Number
            """,
            new
            {
                Saved.Id,
                Number = number,
                Title = title,
                Text = text,
                Data = image ? DoorImageFixtures.Create() : null,
                MediaType = image ? "image/png" : null,
                Width = image ? (int?)32 : null,
                Height = image ? (int?)16 : null,
                Version = image ? (Guid?)ImageVersion : null,
            }
        );

    public Task<int> HistoryCountAsync() =>
        Auth.ScalarAsync<int>("SELECT count(*)::int FROM door_openings");

    public async ValueTask DisposeAsync()
    {
        client.Dispose();
        await calendar.DisposeAsync();
    }
}
