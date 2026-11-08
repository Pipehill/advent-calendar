using Calendar.Api.Models;

namespace Calendar.Api.Services;

public interface ICalendarService
{
    Task<SystemCalendarPage> ListSystemAsync(
        SessionIdentity? identity,
        int offset,
        int limit,
        CancellationToken cancellationToken
    );
    Task<CalendarModel> PreviewSystemAsync(
        SessionIdentity? identity,
        Guid id,
        CancellationToken cancellationToken
    );
    Task<CalendarModel> CreateAsync(
        SessionIdentity? identity,
        string? title,
        Guid recipientId,
        string background,
        CancellationToken cancellationToken
    );
    Task<CalendarModel> GetAsync(
        SessionIdentity? identity,
        Guid id,
        CancellationToken cancellationToken
    );
    Task<CalendarPage> ListAsync(
        SessionIdentity? identity,
        int offset,
        int limit,
        CancellationToken cancellationToken
    );
    Task<CalendarModel> SaveDoorAsync(
        SessionIdentity? identity,
        Guid id,
        int number,
        string? title,
        string? text,
        CancellationToken cancellationToken
    );
    Task<CalendarModel> SaveLayoutAsync(
        SessionIdentity? identity,
        Guid id,
        string layout,
        CancellationToken cancellationToken
    );
    Task<CalendarModel> SaveRecipientAsync(
        SessionIdentity? identity,
        Guid id,
        Guid recipientId,
        CancellationToken cancellationToken
    );
}
