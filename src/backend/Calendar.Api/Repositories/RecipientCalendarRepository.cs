using Calendar.Api.Models;

namespace Calendar.Api.Repositories;

public sealed class RecipientCalendarRepository(SecurityTransaction transaction)
    : IRecipientCalendarRepository
{
    public async Task<RecipientCalendarPage> ListAsync(Guid recipientId, int offset, int limit)
    {
        var parameters = new
        {
            RecipientId = recipientId,
            Offset = offset,
            Limit = limit,
        };
        var rows = await transaction.QueryAsync<RecipientCalendarSummary>(
            """
            SELECT id, title, calendar_year AS Year, background FROM calendars
            WHERE recipient_id = @RecipientId
            ORDER BY created_at DESC, id OFFSET @Offset LIMIT @Limit
            """,
            parameters
        );
        var total = await transaction.ScalarAsync<int>(
            "SELECT count(*)::int FROM calendars WHERE recipient_id = @RecipientId",
            parameters
        );
        return new(rows.ToArray(), total);
    }

    public async Task<IReadOnlyDictionary<int, DateTimeOffset>> HistoryAsync(
        Guid calendarId,
        Guid recipientId
    )
    {
        var rows = await transaction.QueryAsync<OpeningRow>(
            """
            SELECT day_number AS Number, opened_at AS OpenedAt FROM door_openings
            WHERE calendar_id = @CalendarId AND recipient_id = @RecipientId
            """,
            new { CalendarId = calendarId, RecipientId = recipientId }
        );
        return rows.ToDictionary(row => row.Number, row => new DateTimeOffset(row.OpenedAt));
    }

    public async Task<DateTimeOffset> RecordAsync(
        Guid calendarId,
        Guid recipientId,
        int number,
        DateTimeOffset now
    )
    {
        var parameters = new
        {
            CalendarId = calendarId,
            RecipientId = recipientId,
            Number = number,
            Now = now,
        };
        await transaction.ExecuteAsync(
            """
            INSERT INTO door_openings (calendar_id, recipient_id, day_number, opened_at)
            VALUES (@CalendarId, @RecipientId, @Number, @Now)
            ON CONFLICT (calendar_id, recipient_id, day_number) DO NOTHING
            """,
            parameters
        );
        var first = await transaction.ScalarAsync<DateTime>(
            """
            SELECT opened_at FROM door_openings
            WHERE calendar_id = @CalendarId AND recipient_id = @RecipientId AND day_number = @Number
            """,
            parameters
        );
        return new(first);
    }

    private sealed class OpeningRow
    {
        public int Number { get; init; }
        public DateTime OpenedAt { get; init; }
    }
}
