using Calendar.Api.Models;
using Calendar.Security;

namespace Calendar.Api.Services;

public interface IUserAdministrationService
{
    Task<Account> CreateAsync(
        SessionIdentity? identity,
        string? username,
        string? name,
        string? password,
        string role,
        Guid? responsible,
        CancellationToken cancellationToken
    );
    Task<IEnumerable<Account>> ListAsync(
        SessionIdentity? identity,
        int offset,
        int limit,
        CancellationToken cancellationToken
    );
    Task ResetPasswordAsync(
        SessionIdentity? identity,
        Guid id,
        string? password,
        CancellationToken cancellationToken
    );
    Task<bool> ChangeStatusAsync(
        SessionIdentity? identity,
        Guid id,
        bool enabled,
        CancellationToken cancellationToken
    );
    Task ChangeRoleAsync(
        SessionIdentity? identity,
        Guid id,
        string role,
        string? temporaryPassword,
        Guid? responsible,
        CancellationToken cancellationToken
    );
}
