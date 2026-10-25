using Calendar.Api.Models;

namespace Calendar.Api.Repositories;

public interface ISessionRepository
{
    Task<AccountSession?> FindAsync(Guid id, Guid accountId);
    Task InsertAsync(AccountSession session);
    Task SetVerifiedAtAsync(Guid id, DateTimeOffset verifiedAt);
    Task RevokeAsync(Guid id);
    Task RevokeAllAsync(Guid accountId);
}
