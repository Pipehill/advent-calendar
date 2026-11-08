namespace Calendar.Api.Models;

public sealed record CalendarModel(
    Guid Id,
    string Title,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastModifiedAt,
    IReadOnlyList<DoorModel> Doors,
    Guid OwnerId,
    Guid RecipientId,
    int Year,
    string Background,
    string Layout,
    int[] DoorOrder,
    string RecipientName,
    string RecipientUsername
);

public sealed record DoorModel(int Number, string Title, string Text);

public sealed record CalendarPage(IReadOnlyList<CalendarSummary> Calendars, int TotalCount);

public sealed record SystemCalendarPage(
    IReadOnlyList<SystemCalendarSummary> Calendars,
    int TotalCount
);

public sealed class SystemCalendarSummary
{
    public Guid Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public int Year { get; init; }
    public Guid OwnerId { get; init; }
    public string OwnerName { get; init; } = string.Empty;
    public string OwnerUsername { get; init; } = string.Empty;
    public Guid RecipientId { get; init; }
    public string RecipientName { get; init; } = string.Empty;
    public string RecipientUsername { get; init; } = string.Empty;
}

public class CalendarSummary
{
    public Guid Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public Guid RecipientId { get; init; }
    public string RecipientName { get; init; } = string.Empty;
    public string RecipientUsername { get; init; } = string.Empty;
    public int Year { get; init; }
    public string Background { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public DateTime LastModifiedAt { get; init; }
}
