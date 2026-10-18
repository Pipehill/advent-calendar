using System.Diagnostics;
using System.Security.Claims;
using Calendar.Security;
using Microsoft.AspNetCore.Identity;

namespace Calendar.Api.Authentication;

public sealed class AuthenticationService(
    AuthDatabase database,
    SessionService sessions,
    PasswordAttempts attempts,
    UserManager<Account> manager,
    TimeProvider time,
    ILogger<AuthenticationService> logger
)
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
            throw new AuthFailureException(401, "Invalid username or password");
        }
        return await database.RunAsync(
            async () =>
            {
                var current = await database.FindAsync("id = @Id", new { verified.Account.Id });
                if (
                    !attempts.Matches(current, verified.Account)
                    || current!.LockedUntil > time.GetUtcNow()
                )
                    throw new AuthFailureException(401, "Invalid username or password");
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
                await database.ExecuteAsync(
                    """
                    INSERT INTO account_sessions (id, account_id, security_version, created_at,
                        expires_at, verified_at, is_restricted) VALUES (@Id, @AccountId, @SecurityVersion,
                        @CreatedAt, @ExpiresAt, @VerifiedAt, @Restricted)
                    """,
                    session
                );
                SecurityLog.Event(logger, "login", current.Id, current.Id, "accepted");
                return new AuthenticatedAccount(current, session);
            },
            cancellationToken
        );
    }

    public async Task ReauthenticateAsync(
        ClaimsPrincipal principal,
        string? password,
        CancellationToken cancellationToken
    )
    {
        var actor = await database.RunAsync(
            () => sessions.RequireAsync(principal, administrator: true),
            cancellationToken
        );
        var verified =
            await attempts.CheckAsync(actor.Account.UserName, password, cancellationToken)
            ?? throw new AuthFailureException(401, "Password verification failed");
        await database.RunAsync(
            async () =>
            {
                var current = await sessions.RequireAsync(principal, administrator: true);
                EnsureVerified(current, verified);
                await attempts.ApplyUpgradeAsync(verified);
                await database.ExecuteAsync(
                    "UPDATE account_sessions SET verified_at = @Now WHERE id = @Id",
                    new { Now = time.GetUtcNow(), current.Session.Id }
                );
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
        ClaimsPrincipal principal,
        string? oldPassword,
        string? newPassword,
        CancellationToken cancellationToken
    )
    {
        var actor = await database.RunAsync(
            () => sessions.RequireAsync(principal, unrestricted: false),
            cancellationToken
        );
        var verified =
            await attempts.CheckAsync(actor.Account.UserName, oldPassword, cancellationToken)
            ?? throw new AuthFailureException(401, "Password verification failed");
        await ValidatePasswordAsync(actor.Account.Role, newPassword);
        if (oldPassword == newPassword)
            throw new AuthFailureException(409, "Replacement password must differ", "newPassword");
        var hash = manager.PasswordHasher.HashPassword(actor.Account, newPassword!);
        await database.RunAsync(
            async () =>
            {
                var current = await sessions.RequireAsync(principal, unrestricted: false);
                EnsureVerified(current, verified);
                await ReplacePasswordAsync(current.Account.Id, hash, temporary: false);
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

    public Task<bool> LogoutAsync(ClaimsPrincipal principal, CancellationToken cancellationToken) =>
        database.RunAsync(
            async () =>
            {
                // Expired/revoked sessions may still clear their browser cookie.
                if (
                    Guid.TryParse(principal.FindFirstValue(SessionService.SessionClaim), out var id)
                )
                    await database.ExecuteAsync(
                        "UPDATE account_sessions SET revoked = true WHERE id = @Id",
                        new { Id = id }
                    );
                SecurityLog.Event(logger, "logout", null, null, "accepted");
                return true;
            },
            cancellationToken
        );

    public async Task ValidatePasswordAsync(string role, string? password)
    {
        foreach (var validator in manager.PasswordValidators)
        {
            var result = await validator.ValidateAsync(
                manager,
                new Account { Role = role },
                password
            );
            if (!result.Succeeded)
                throw new AuthFailureException(400, result.Errors.First().Description, "password");
        }
    }

    public async Task ReplacePasswordAsync(Guid id, string hash, bool temporary)
    {
        await database.ExecuteAsync(
            """
            UPDATE accounts SET password_hash = @Hash, security_version = @Version,
                must_change_password = @Temporary, temporary_password_expires_at = @Deadline,
                locked_until = NULL WHERE id = @Id
            """,
            new
            {
                Id = id,
                Hash = hash,
                Version = Guid.NewGuid(),
                Temporary = temporary,
                Deadline = temporary ? time.GetUtcNow().AddMinutes(30) : (DateTimeOffset?)null,
            }
        );
        await database.ExecuteAsync(
            "DELETE FROM password_failures WHERE account_id = @Id",
            new { Id = id }
        );
        await RevokeAsync(id);
    }

    public Task<int> RevokeAsync(Guid id) =>
        database.ExecuteAsync(
            "UPDATE account_sessions SET revoked = true WHERE account_id = @Id",
            new { Id = id }
        );

    private void EnsureVerified(AuthenticatedAccount current, VerifiedPassword verified)
    {
        if (
            !attempts.Matches(current.Account, verified.Account)
            || current.Account.LockedUntil > time.GetUtcNow()
        )
            throw new AuthFailureException(
                409,
                "Account changed; verify the current password again"
            );
    }
}
