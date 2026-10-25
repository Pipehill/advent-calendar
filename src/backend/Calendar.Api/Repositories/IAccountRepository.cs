using Calendar.Security;

namespace Calendar.Api.Repositories;

public interface IAccountRepository
{
    Task<Account?> FindByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Account?> FindByNormalizedNameAsync(string name, CancellationToken cancellationToken);
    Task InsertAsync(Account account);
    Task<bool> TryUpdatePasswordHashAsync(Account account);
    Task<IEnumerable<Account>> ListAsync(bool allAccounts, Guid actorId, int offset, int limit);
    Task SetEnabledAsync(Guid id, bool enabled, Guid securityVersion);
    Task<bool> HasResponsibleUsersAsync(Guid id);
    Task SetResponsibleAdministratorAsync(Guid id, Guid? responsibleAdministratorId);
    Task SetRoleAsync(Guid id, string role, Guid securityVersion);
    Task ReplacePasswordAsync(
        Guid id,
        string hash,
        Guid securityVersion,
        bool temporary,
        DateTimeOffset? temporaryPasswordExpiresAt
    );
    Task SetLockedUntilAsync(Guid id, DateTimeOffset? lockedUntil);
}
