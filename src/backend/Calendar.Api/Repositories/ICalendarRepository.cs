using Calendar.Api.Models;

namespace Calendar.Api.Repositories;

public interface ICalendarRepository
{
    Task InsertAsync(CalendarModel calendar);
    Task<CalendarModel?> GetAsync(Guid id, Guid ownerId);
    Task<CalendarModel?> GetSystemPreviewAsync(Guid id);
    Task<SystemCalendarPage> ListSystemAsync(int offset, int limit);
    Task<CalendarPage> ListAsync(Guid ownerId, int offset, int limit);
    Task SaveDoorAsync(Guid id, int number, string title, string text, DateTimeOffset modified);
    Task SaveLayoutAsync(Guid id, string layout, int[] order, DateTimeOffset modified);
    Task SaveRecipientAsync(Guid id, Guid recipientId, DateTimeOffset modified);
}
