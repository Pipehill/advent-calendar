using Calendar.Api.Models;

namespace Calendar.Api.Services;

public interface IAuthenticationService
{
    Task<AuthenticatedAccount> LoginAsync(
        string? username,
        string? password,
        CancellationToken cancellationToken
    );
    Task ReauthenticateAsync(
        SessionIdentity? identity,
        string? password,
        CancellationToken cancellationToken
    );
    Task ChangePasswordAsync(
        SessionIdentity? identity,
        string? oldPassword,
        string? newPassword,
        CancellationToken cancellationToken
    );
    Task<bool> LogoutAsync(SessionIdentity? identity, CancellationToken cancellationToken);
}
