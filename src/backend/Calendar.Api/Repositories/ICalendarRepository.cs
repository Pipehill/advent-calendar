using Calendar.Api.Models;

namespace Calendar.Api.Repositories;

public interface ICalendarRepository
{
    Task InsertAsync(CalendarModel calendar);
    Task<CalendarModel?> GetAsync(Guid id, Guid ownerId);
    Task<CalendarModel?> GetSystemPreviewAsync(Guid id);
    Task<CalendarModel?> GetForRecipientAsync(Guid id, Guid recipientId);
    Task<DoorImage?> GetDoorImageAsync(Guid id, int number);
    Task<SystemCalendarPage> ListSystemAsync(int offset, int limit);
    Task<CalendarPage> ListAsync(Guid ownerId, int offset, int limit);
    Task SaveDoorAsync(
        Guid id,
        int number,
        string title,
        string text,
        DateTimeOffset modified,
        string imageAction = "keep",
        DoorImage? image = null
    );
    Task SaveLayoutAsync(Guid id, string layout, int[] order, DateTimeOffset modified);
    Task SaveRecipientAsync(Guid id, Guid recipientId, DateTimeOffset modified);
}
