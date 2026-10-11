namespace Calendar.Api.Models;

public sealed record CalendarModel(
    Guid Id,
    string Title,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastModifiedAt,
    IReadOnlyList<DoorModel> Doors
);

public sealed record DoorModel(int Number, string Text);
