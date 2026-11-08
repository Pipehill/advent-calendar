using Calendar.Api.Models;

namespace Calendar.Api.Repositories;

// Calendar writes share the committing security transaction and lock 800008 with
// actor/recipient checks and account maintenance across API instances.
public sealed class CalendarRepository(SecurityTransaction transaction) : ICalendarRepository
{
    public async Task InsertAsync(CalendarModel calendar)
    {
        await transaction.ExecuteAsync(
            """
            INSERT INTO calendars (id, title, created_at, last_modified_at, owner_id,
                recipient_id, calendar_year, background, layout, door_order)
            VALUES (@Id, @Title, @CreatedAt, @LastModifiedAt, @OwnerId,
                @RecipientId, @Year, @Background, @Layout, @DoorOrder)
            """,
            calendar
        );
        foreach (var door in calendar.Doors)
            await transaction.ExecuteAsync(
                """
                INSERT INTO doors (calendar_id, day_number, content_title, content_text)
                VALUES (@CalendarId, @Number, @Title, @Text)
                """,
                new
                {
                    CalendarId = calendar.Id,
                    door.Number,
                    door.Title,
                    door.Text,
                }
            );
    }

    public Task<CalendarModel?> GetAsync(Guid id, Guid ownerId) => ReadAsync(id, ownerId);

    public Task<CalendarModel?> GetSystemPreviewAsync(Guid id) => ReadAsync(id, null);

    private async Task<CalendarModel?> ReadAsync(Guid id, Guid? ownerId)
    {
        var rows = (
            await transaction.QueryAsync<CalendarRow>(
                """
                SELECT c.id, c.title, c.created_at AS CreatedAt, c.last_modified_at AS LastModifiedAt,
                    c.owner_id AS OwnerId, c.recipient_id AS RecipientId, c.calendar_year AS Year,
                    c.background, c.layout, c.door_order AS DoorOrder,
                    recipient.name AS RecipientName, recipient.user_name AS RecipientUsername,
                    d.day_number AS Number, d.content_title AS DoorTitle, d.content_text AS Text
                FROM calendars c JOIN doors d ON d.calendar_id = c.id
                JOIN accounts recipient ON recipient.id = c.recipient_id
                WHERE c.id = @Id AND (@OwnerId::uuid IS NULL OR c.owner_id = @OwnerId)
                ORDER BY d.day_number
                """,
                new { Id = id, OwnerId = ownerId }
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
            rows.Select(row => new DoorModel(row.Number, row.DoorTitle, row.Text)).ToArray(),
            first.OwnerId,
            first.RecipientId,
            first.Year,
            first.Background,
            first.Layout,
            first.DoorOrder,
            first.RecipientName,
            first.RecipientUsername
        );
    }

    public async Task<SystemCalendarPage> ListSystemAsync(int offset, int limit)
    {
        var calendars = (
            await transaction.QueryAsync<SystemCalendarSummary>(
                """
                SELECT c.id, c.title, c.calendar_year AS Year, c.owner_id AS OwnerId,
                    owner.name AS OwnerName, owner.user_name AS OwnerUsername,
                    c.recipient_id AS RecipientId, recipient.name AS RecipientName,
                    recipient.user_name AS RecipientUsername
                FROM calendars c
                JOIN accounts owner ON owner.id = c.owner_id
                JOIN accounts recipient ON recipient.id = c.recipient_id
                ORDER BY c.created_at DESC, c.id OFFSET @Offset LIMIT @Limit
                """,
                new { Offset = offset, Limit = limit }
            )
        ).ToArray();
        var total = await transaction.ScalarAsync<int>("SELECT count(*)::int FROM calendars");
        return new SystemCalendarPage(calendars, total);
    }

    public async Task<CalendarPage> ListAsync(Guid ownerId, int offset, int limit)
    {
        var parameters = new
        {
            OwnerId = ownerId,
            Offset = offset,
            Limit = limit,
        };
        var calendars = (
            await transaction.QueryAsync<CalendarSummary>(
                """
                SELECT c.id, c.title, c.recipient_id AS RecipientId, c.calendar_year AS Year,
                    c.background, c.created_at AS CreatedAt, c.last_modified_at AS LastModifiedAt,
                    recipient.name AS RecipientName, recipient.user_name AS RecipientUsername
                FROM calendars c JOIN accounts recipient ON recipient.id = c.recipient_id
                WHERE c.owner_id = @OwnerId
                ORDER BY c.created_at DESC, c.id OFFSET @Offset LIMIT @Limit
                """,
                parameters
            )
        ).ToArray();
        var total = await transaction.ScalarAsync<int>(
            "SELECT count(*)::int FROM calendars WHERE owner_id = @OwnerId",
            parameters
        );
        return new CalendarPage(calendars, total);
    }

    public async Task SaveDoorAsync(
        Guid id,
        int number,
        string title,
        string text,
        DateTimeOffset modified
    )
    {
        await transaction.ExecuteAsync(
            """
            UPDATE doors SET content_title = @Title, content_text = @Text
            WHERE calendar_id = @Id AND day_number = @Number
            """,
            new
            {
                Id = id,
                Number = number,
                Title = title,
                Text = text,
            }
        );
        await transaction.ExecuteAsync(
            "UPDATE calendars SET last_modified_at = @Modified WHERE id = @Id",
            new { Id = id, Modified = modified }
        );
    }

    public async Task SaveLayoutAsync(
        Guid id,
        string layout,
        int[] order,
        DateTimeOffset modified
    ) =>
        await transaction.ExecuteAsync(
            """
            UPDATE calendars SET layout = @Layout, door_order = @Order, last_modified_at = @Modified
            WHERE id = @Id
            """,
            new
            {
                Id = id,
                Layout = layout,
                Order = order,
                Modified = modified,
            }
        );

    public async Task SaveRecipientAsync(Guid id, Guid recipientId, DateTimeOffset modified)
    {
        await transaction.ExecuteAsync(
            """
            UPDATE calendars SET recipient_id = @RecipientId, last_modified_at = @Modified
            WHERE id = @Id
            """,
            new
            {
                Id = id,
                RecipientId = recipientId,
                Modified = modified,
            }
        );
    }

    private sealed class CalendarRow : CalendarSummary
    {
        public Guid OwnerId { get; init; }
        public string Layout { get; init; } = string.Empty;
        public int[] DoorOrder { get; init; } = [];
        public int Number { get; init; }
        public string DoorTitle { get; init; } = string.Empty;
        public string Text { get; init; } = string.Empty;
    }
}
