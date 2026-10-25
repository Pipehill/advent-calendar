using Calendar.Api.Models;

namespace Calendar.Api.Services;

public interface ISessionService
{
    Task<AuthenticatedAccount?> ReadAsync(
        SessionIdentity? identity,
        CancellationToken cancellationToken
    );

    // Requires the caller's shared security transaction so checks and writes are atomic.
    Task<AuthenticatedAccount> RequireAsync(
        SessionIdentity? identity,
        bool administrator = false,
        bool recent = false,
        bool unrestricted = true
    );
}
