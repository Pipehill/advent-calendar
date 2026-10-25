using Calendar.Api.Models;

namespace Calendar.Api.Repositories;

public interface ICalendarRepository
{
    Task InsertAsync(CalendarModel calendar, CancellationToken cancellationToken);
    Task<CalendarModel?> GetAsync(Guid id, CancellationToken cancellationToken);
}
