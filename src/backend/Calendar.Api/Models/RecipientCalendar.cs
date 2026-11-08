namespace Calendar.Api.Models;

public sealed class RecipientCalendarSummary
{
    public Guid Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public int Year { get; init; }
    public string Background { get; init; } = string.Empty;
}

public sealed record RecipientCalendarPage(
    IReadOnlyList<RecipientCalendarSummary> Calendars,
    int TotalCount
);

public sealed record RecipientDoor(
    int Number,
    DateOnly Date,
    DateTimeOffset OpensAt,
    string State,
    DateTimeOffset? OpenedAt
);

public sealed record RecipientCalendar(
    Guid Id,
    string Title,
    int Year,
    string Background,
    string Layout,
    int[] DoorOrder,
    DateTimeOffset LastModifiedAt,
    DateTimeOffset ServerTime,
    DateTimeOffset? NextOpeningAt,
    IReadOnlyList<RecipientDoor> Doors
);

public sealed record RecipientOpening(
    DoorModel Door,
    DateTimeOffset OpenedAt,
    DateTimeOffset LastModifiedAt
);
