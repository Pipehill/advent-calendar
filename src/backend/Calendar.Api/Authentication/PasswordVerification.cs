using Calendar.Security;
using Microsoft.AspNetCore.Identity;

namespace Calendar.Api.Authentication;

// Tests can replace this seam to coordinate verification/mutation races without
// weakening real hashing, production policy or database concurrency controls.
public interface IPasswordVerification
{
    Task<PasswordVerificationResult> VerifyAsync(Account account, string password);
}

public sealed class PasswordVerification(UserManager<Account> manager) : IPasswordVerification
{
    public Task<PasswordVerificationResult> VerifyAsync(Account account, string password) =>
        Task.FromResult(
            manager.PasswordHasher.VerifyHashedPassword(account, account.PasswordHash, password)
        );
}

public sealed class PasswordAttempts(
    AuthDatabase database,
    TimeProvider time,
    IPasswordVerification verifier,
    UserManager<Account> manager,
    ILogger<PasswordAttempts> logger
)
{
    // This is a random process-only timing decoy, never a persisted or usable account.
    private static readonly Lazy<Account> Decoy = new(() =>
    {
        var account = new Account();
        account.PasswordHash = new ArgonPasswordHasher().HashPassword(
            account,
            Guid.NewGuid().ToString()
        );
        return account;
    });

    public async Task<VerifiedPassword?> CheckAsync(
        string username,
        string? password,
        CancellationToken cancellationToken
    )
    {
        if (password is null || password.Length > 256)
            return null;
        var account = await database.RunAsync(
            async () =>
            {
                var found = AccountNames.IsValid(username)
                    ? await manager.FindByNameAsync(username)
                    : null;
                if (found is null || !found.Enabled)
                    return null;
                if (found.LockedUntil > time.GetUtcNow())
                    return null;
                if (found.LockedUntil is not null)
                {
                    await ClearAsync(found.Id);
                    found.LockedUntil = null;
                }
                if (
                    found.MustChangePassword
                    && found.TemporaryPasswordExpiresAt <= time.GetUtcNow()
                )
                    return null;
                return found;
            },
            cancellationToken
        );

        if (account is null)
        {
            // Locked accounts must not start hashes, including decoy work. Unknown
            // identities use the same external failure but consume bounded hash work.
            var known = AccountNames.IsValid(username)
                ? await manager.FindByNameAsync(username)
                : null;
            if (known is null)
                await verifier.VerifyAsync(Decoy.Value, password);
            return null;
        }
        var result = await verifier.VerifyAsync(account, password);
        var upgrade =
            result == PasswordVerificationResult.SuccessRehashNeeded
                ? manager.PasswordHasher.HashPassword(account, password)
                : null;
        return await database.RunAsync(
            async () =>
            {
                var current = await database.FindAsync("id = @Id", new { account.Id });
                if (!Matches(current, account) || current!.LockedUntil > time.GetUtcNow())
                    return null;
                if (current.LockedUntil is not null)
                    await ClearAsync(current.Id);
                if (result == PasswordVerificationResult.Failed)
                {
                    await FailAsync(current.Id);
                    return null;
                }
                await ClearAsync(current.Id);
                return new VerifiedPassword(account, upgrade);
            },
            cancellationToken
        );
    }

    public bool Matches(Account? current, Account verified) =>
        current is not null
        && current.Enabled
        && current.SecurityVersion == verified.SecurityVersion
        && current.PasswordHash == verified.PasswordHash
        && current.Role == verified.Role
        && (!current.MustChangePassword || current.TemporaryPasswordExpiresAt > time.GetUtcNow());

    public async Task ApplyUpgradeAsync(VerifiedPassword verified)
    {
        if (verified.UpgradedHash is null)
            return;
        verified.Account.PasswordHash = verified.UpgradedHash;
        var result = await manager.UpdateAsync(verified.Account);
        if (!result.Succeeded)
            throw new AuthFailureException(409, "Account changed; retry authentication");
    }

    private async Task ClearAsync(Guid id)
    {
        await database.ExecuteAsync(
            "DELETE FROM password_failures WHERE account_id = @Id",
            new { Id = id }
        );
        await database.ExecuteAsync(
            "UPDATE accounts SET locked_until = NULL WHERE id = @Id",
            new { Id = id }
        );
    }

    private async Task FailAsync(Guid id)
    {
        var now = time.GetUtcNow();
        await database.ExecuteAsync(
            "DELETE FROM password_failures WHERE account_id = @Id AND occurred_at <= @Cutoff",
            new { Id = id, Cutoff = now.AddMinutes(-15) }
        );
        await database.ExecuteAsync(
            "INSERT INTO password_failures (account_id, occurred_at) VALUES (@Id, @Now)",
            new { Id = id, Now = now }
        );
        if (
            await database.ScalarAsync<int>(
                "SELECT count(*)::int FROM password_failures WHERE account_id = @Id",
                new { Id = id }
            ) >= 5
        )
        {
            await database.ExecuteAsync(
                "UPDATE accounts SET locked_until = @Until WHERE id = @Id",
                new { Id = id, Until = now.AddMinutes(15) }
            );
            SecurityLog.Event(logger, "account-paused", null, id, "denied");
        }
    }
}

public sealed record VerifiedPassword(Account Account, string? UpgradedHash);

internal static partial class SecurityLog
{
    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "Security operation {Operation}; actor {ActorId}; target {TargetId}; result {Result}"
    )]
    public static partial void Event(
        ILogger logger,
        string operation,
        Guid? actorId,
        Guid? targetId,
        string result
    );
}
