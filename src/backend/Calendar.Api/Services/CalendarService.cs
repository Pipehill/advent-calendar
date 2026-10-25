using System.Text;
using Calendar.Api.Models;
using Calendar.Api.Repositories;

namespace Calendar.Api.Services;

public sealed class CalendarService(ICalendarRepository repository, TimeProvider clock)
    : ICalendarService
{
    public CalendarModel Initialize(string? title)
    {
        var normalized = title?.Trim();
        var length = normalized?.EnumerateRunes().Count() ?? 0;
        if (length is < 1 or > 100 || normalized!.Contains('\0', StringComparison.Ordinal))
        {
            throw new InvalidTitleException();
        }

        var instant = clock.GetUtcNow();
        // PostgreSQL instants have microsecond precision; POST and GET must agree.
        var now = new DateTimeOffset(instant.Ticks - instant.Ticks % 10, TimeSpan.Zero);
        var doors = Enumerable
            .Range(1, 24)
            .Select(number => new DoorModel(number, string.Empty))
            .ToArray();
        return new CalendarModel(Guid.NewGuid(), normalized, now, now, doors);
    }

    public async Task<CalendarModel> CreateAsync(string? title, CancellationToken cancellationToken)
    {
        var calendar = Initialize(title);
        await repository.InsertAsync(calendar, cancellationToken);
        return calendar;
    }

    public Task<CalendarModel?> GetAsync(Guid id, CancellationToken cancellationToken) =>
        repository.GetAsync(id, cancellationToken);
}

public sealed class InvalidTitleException : Exception
{
    public InvalidTitleException()
        : base("Title must contain 1-100 Unicode code points after trimming and no NUL.") { }
}
