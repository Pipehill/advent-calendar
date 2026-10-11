using Calendar.Api.Models;
using Dapper;
using Npgsql;

namespace Calendar.Api.Repositories;

public sealed class CalendarRepository(NpgsqlDataSource source) : ICalendarRepository
{
    public async Task InsertAsync(
        CalendarModel calendar,
        CancellationToken cancellationToken,
        bool skipExisting = false
    )
    {
        await using var connection = await source.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        const string insert = """
            INSERT INTO calendars (id, title, created_at, last_modified_at)
            VALUES (@Id, @Title, @CreatedAt, @LastModifiedAt)
            ON CONFLICT (id) DO NOTHING;
            """;
        var inserted = await connection.ExecuteAsync(
            new CommandDefinition(
                insert,
                calendar,
                transaction,
                cancellationToken: cancellationToken
            )
        );
        if (inserted == 0 && !skipExisting)
        {
            throw new InvalidOperationException("Calendar identifier already exists.");
        }

        if (inserted != 0)
        {
            foreach (var door in calendar.Doors)
            {
                await connection.ExecuteAsync(
                    new CommandDefinition(
                        "INSERT INTO doors (calendar_id, day_number, content_text) VALUES (@CalendarId, @Number, @Text)",
                        new
                        {
                            CalendarId = calendar.Id,
                            door.Number,
                            door.Text,
                        },
                        transaction,
                        cancellationToken: cancellationToken
                    )
                );
            }
        }

        await transaction.CommitAsync(cancellationToken);
    }

    public async Task<CalendarModel?> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        await using var connection = await source.OpenConnectionAsync(cancellationToken);
        // One statement gives the aggregate one consistent database snapshot.
        const string query = """
            SELECT c.id, c.title, c.created_at AS CreatedAt, c.last_modified_at AS LastModifiedAt,
                   d.day_number AS Number, d.content_text AS Text
            FROM calendars AS c
            JOIN doors AS d ON d.calendar_id = c.id
            WHERE c.id = @Id
            ORDER BY d.day_number
            """;
        var rows = (
            await connection.QueryAsync<CalendarRow>(
                new CommandDefinition(query, new { Id = id }, cancellationToken: cancellationToken)
            )
        ).ToArray();
        if (rows.Length == 0)
            return null;
        var first = rows[0];
        return new CalendarModel(
            first.Id,
            first.Title,
            new DateTimeOffset(first.CreatedAt),
            new DateTimeOffset(first.LastModifiedAt),
            rows.Select(row => new DoorModel(row.Number, row.Text)).ToArray()
        );
    }

    private sealed class CalendarRow
    {
        public Guid Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public DateTime LastModifiedAt { get; set; }
        public int Number { get; set; }
        public string Text { get; set; } = string.Empty;
    }
}
