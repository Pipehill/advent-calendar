using Calendar.Api.Models;

namespace Calendar.Api.Services;

public sealed record CalendarOpeningOptions(bool DisableTimeCheck)
{
    public static CalendarOpeningOptions Read(
        IConfiguration configuration,
        IHostEnvironment environment
    )
    {
        var disabled = configuration.GetValue<bool>("CalendarOpening:DisableTimeCheck");
        if (disabled && !environment.IsDevelopment())
            throw new InvalidOperationException(
                "Calendar time checks can only be disabled in Development."
            );
        return new(disabled);
    }
}

public sealed class CalendarOpeningPolicy(CalendarOpeningOptions options)
{
    private static readonly TimeZoneInfo Oslo = TimeZoneInfo.FindSystemTimeZoneById("Europe/Oslo");

    public static DateTimeOffset OpensAt(int year, int number) =>
        new(
            TimeZoneInfo.ConvertTimeToUtc(
                new DateTime(year, 12, number, 7, 0, 0, DateTimeKind.Unspecified),
                Oslo
            )
        );

    public static bool HasContent(DoorModel door) =>
        !string.IsNullOrWhiteSpace(door.Title)
        || !string.IsNullOrWhiteSpace(door.Text)
        || door.Image is not null;

    public bool TimeAllows(int year, int number, DateTimeOffset now) =>
        options.DisableTimeCheck || now >= OpensAt(year, number);

    public string State(int year, DoorModel door, DateTimeOffset now)
    {
        if (!TimeAllows(year, door.Number, now))
            return "locked";
        return HasContent(door) ? "available" : "empty";
    }
}
