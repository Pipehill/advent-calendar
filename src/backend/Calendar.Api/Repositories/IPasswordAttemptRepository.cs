namespace Calendar.Api.Repositories;

public interface IPasswordAttemptRepository
{
    Task ClearAsync(Guid accountId);
    Task RemoveExpiredAsync(Guid accountId, DateTimeOffset cutoff);
    Task InsertAsync(Guid accountId, DateTimeOffset occurredAt);
    Task<int> CountAsync(Guid accountId);
}
