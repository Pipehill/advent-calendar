using Calendar.Api.Models;

namespace Calendar.Api.Repositories;

public interface IRecipientCalendarRepository
{
    Task<RecipientCalendarPage> ListAsync(Guid recipientId, int offset, int limit);
    Task<IReadOnlyDictionary<int, DateTimeOffset>> HistoryAsync(Guid calendarId, Guid recipientId);
    Task<DateTimeOffset> RecordAsync(
        Guid calendarId,
        Guid recipientId,
        int number,
        DateTimeOffset now
    );
}
