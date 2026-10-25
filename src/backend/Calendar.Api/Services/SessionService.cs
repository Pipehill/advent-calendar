using Calendar.Api.Models;
using Calendar.Api.Repositories;
using Calendar.Security;

namespace Calendar.Api.Services;

public sealed class SessionService(
    ISecurityTransaction transaction,
    IAccountRepository accounts,
    ISessionRepository sessions,
    TimeProvider time
) : ISessionService
{
    public Task<AuthenticatedAccount?> ReadAsync(
        SessionIdentity? identity,
        CancellationToken cancellationToken
    ) => transaction.RunAsync(() => ReadInTransactionAsync(identity), cancellationToken);

    private async Task<AuthenticatedAccount?> ReadInTransactionAsync(SessionIdentity? identity)
    {
        if (identity is null)
            return null;
        var account = await accounts.FindByIdAsync(identity.AccountId);
        var session = await sessions.FindAsync(identity.SessionId, identity.AccountId);
        var now = time.GetUtcNow();
        if (
            account is null
            || session is null
            || !account.Enabled
            || session.Revoked
            || session.SecurityVersion != account.SecurityVersion
            || session.ExpiresAt <= now
            || (
                account.MustChangePassword
                && (account.TemporaryPasswordExpiresAt <= now || !session.Restricted)
            )
        )
            return null;
        return new(account, session);
    }

    public async Task<AuthenticatedAccount> RequireAsync(
        SessionIdentity? identity,
        bool administrator = false,
        bool recent = false,
        bool unrestricted = true
    )
    {
        var actor =
            await ReadInTransactionAsync(identity)
            ?? throw new AccountFailureException(
                AccountFailure.Unauthenticated,
                "Authentication required"
            );
        if (
            (unrestricted && actor.Session.Restricted)
            || (administrator && !AccountRoles.IsAdministrator(actor.Account.Role))
        )
            throw new AccountFailureException(
                AccountFailure.Forbidden,
                "Operation is not permitted"
            );
        if (
            recent
            && (
                actor.Session.VerifiedAt is null
                || actor.Session.VerifiedAt.Value.AddMinutes(5) <= time.GetUtcNow()
            )
        )
            throw new AccountFailureException(
                AccountFailure.VerificationRequired,
                "Recent administrator password verification required"
            );
        return actor;
    }
}
