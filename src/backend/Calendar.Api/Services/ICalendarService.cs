using Calendar.Api.Models;

namespace Calendar.Api.Services;

public interface ICalendarService
{
    Task<CalendarModel> CreateAsync(string? title, CancellationToken cancellationToken);
    Task<CalendarModel?> GetAsync(Guid id, CancellationToken cancellationToken);
    CalendarModel Initialize(string? title, Guid? id = null);
}
