using System.Diagnostics;
using Calendar.Api.Infrastructure;
using Calendar.Api.Models;
using Calendar.Api.Repositories;
using Calendar.Security;

namespace Calendar.Api.Services;

public sealed class AuthenticationService(
    ISecurityTransaction transaction,
    IAccountRepository accounts,
    ISessionRepository sessionRepository,
    ISessionService sessions,
    AccountCredentialService credentials,
    PasswordAttempts attempts,
    TimeProvider time,
    ILogger<AuthenticationService> logger
) : IAuthenticationService
{
    public async Task<AuthenticatedAccount> LoginAsync(
        string? username,
        string? password,
        CancellationToken cancellationToken
    )
    {
        var started = Stopwatch.GetTimestamp();
        var verified = await attempts.CheckAsync(username ?? "", password, cancellationToken);
        if (verified is null)
        {
            // Paused/disabled accounts do no hashing. A shared failure floor also
            // avoids advertising those inexpensive paths through immediate replies.
            var remaining = TimeSpan.FromMilliseconds(500) - Stopwatch.GetElapsedTime(started);
            if (remaining > TimeSpan.Zero)
                await Task.Delay(remaining, cancellationToken);
            SecurityLog.Event(logger, "login", null, null, "denied");
            throw new AccountFailureException(
                AccountFailure.Unauthenticated,
                "Invalid username or password"
            );
        }
        return await transaction.RunAsync(
            async () =>
            {
                var current = await accounts.FindByIdAsync(verified.Account.Id);
                if (
                    !attempts.Matches(current, verified.Account)
                    || current!.LockedUntil > time.GetUtcNow()
                )
                    throw new AccountFailureException(
                        AccountFailure.Unauthenticated,
                        "Invalid username or password"
                    );
                await attempts.ApplyUpgradeAsync(verified);
                var now = time.GetUtcNow();
                var expiry = now.Add(
                    AccountRoles.IsAdministrator(current.Role)
                        ? TimeSpan.FromHours(8)
                        : TimeSpan.FromDays(30)
                );
                if (current.MustChangePassword)
                    expiry = new[]
                    {
                        expiry,
                        now.AddMinutes(10),
                        current.TemporaryPasswordExpiresAt!.Value,
                    }.Min();
                var session = new AccountSession
                {
                    Id = Guid.NewGuid(),
                    AccountId = current.Id,
                    SecurityVersion = current.SecurityVersion,
                    CreatedAt = now,
                    ExpiresAt = expiry,
                    Restricted = current.MustChangePassword,
                    VerifiedAt = current.MustChangePassword ? null : now,
                };
                await sessionRepository.InsertAsync(session);
                SecurityLog.Event(logger, "login", current.Id, current.Id, "accepted");
                return new AuthenticatedAccount(current, session);
            },
            cancellationToken
        );
    }

    public async Task ReauthenticateAsync(
        SessionIdentity? identity,
        string? password,
        CancellationToken cancellationToken
    )
    {
        var actor = await transaction.RunAsync(
            () => sessions.RequireAsync(identity, administrator: true),
            cancellationToken
        );
        var verified =
            await attempts.CheckAsync(actor.Account.UserName, password, cancellationToken)
            ?? throw new AccountFailureException(
                AccountFailure.Unauthenticated,
                "Password verification failed"
            );
        await transaction.RunAsync(
            async () =>
            {
                var current = await sessions.RequireAsync(identity, administrator: true);
                EnsureVerified(current, verified);
                await attempts.ApplyUpgradeAsync(verified);
                await sessionRepository.SetVerifiedAtAsync(current.Session.Id, time.GetUtcNow());
                SecurityLog.Event(
                    logger,
                    "reauthenticate",
                    current.Account.Id,
                    current.Account.Id,
                    "accepted"
                );
                return true;
            },
            cancellationToken
        );
    }

    public async Task ChangePasswordAsync(
        SessionIdentity? identity,
        string? oldPassword,
        string? newPassword,
        CancellationToken cancellationToken
    )
    {
        var actor = await transaction.RunAsync(
            () => sessions.RequireAsync(identity, unrestricted: false),
            cancellationToken
        );
        var verified =
            await attempts.CheckAsync(actor.Account.UserName, oldPassword, cancellationToken)
            ?? throw new AccountFailureException(
                AccountFailure.Unauthenticated,
                "Password verification failed"
            );
        await credentials.ValidatePasswordAsync(actor.Account.Role, newPassword);
        if (oldPassword == newPassword)
            throw new AccountFailureException(
                AccountFailure.Conflict,
                "Replacement password must differ",
                "newPassword"
            );
        var hash = credentials.HashPassword(actor.Account, newPassword!);
        await transaction.RunAsync(
            async () =>
            {
                var current = await sessions.RequireAsync(identity, unrestricted: false);
                EnsureVerified(current, verified);
                await credentials.ReplacePasswordAsync(current.Account.Id, hash, temporary: false);
                SecurityLog.Event(
                    logger,
                    "change-password",
                    current.Account.Id,
                    current.Account.Id,
                    "accepted"
                );
                return true;
            },
            cancellationToken
        );
    }

    public Task<bool> LogoutAsync(SessionIdentity? identity, CancellationToken cancellationToken) =>
        transaction.RunAsync(
            async () =>
            {
                // Expired/revoked sessions may still clear their browser cookie.
                if (identity is not null)
                    await sessionRepository.RevokeAsync(identity.SessionId);
                SecurityLog.Event(logger, "logout", null, null, "accepted");
                return true;
            },
            cancellationToken
        );

    private void EnsureVerified(AuthenticatedAccount current, VerifiedPassword verified)
    {
        if (
            !attempts.Matches(current.Account, verified.Account)
            || current.Account.LockedUntil > time.GetUtcNow()
        )
            throw new AccountFailureException(
                AccountFailure.Conflict,
                "Account changed; verify the current password again"
            );
    }
}
