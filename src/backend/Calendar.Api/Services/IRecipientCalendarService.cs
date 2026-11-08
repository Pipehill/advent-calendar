using Calendar.Api.Models;

namespace Calendar.Api.Services;

public interface IRecipientCalendarService
{
    Task<RecipientCalendarPage> ListAsync(
        SessionIdentity? identity,
        int offset,
        int limit,
        CancellationToken cancellationToken
    );
    Task<RecipientCalendar> GetAsync(
        SessionIdentity? identity,
        Guid id,
        CancellationToken cancellationToken
    );
    Task<RecipientOpening> OpenAsync(
        SessionIdentity? identity,
        Guid id,
        int number,
        CancellationToken cancellationToken
    );
    Task<DoorImage> ImageAsync(
        SessionIdentity? identity,
        Guid id,
        int number,
        Guid version,
        CancellationToken cancellationToken
    );
}
