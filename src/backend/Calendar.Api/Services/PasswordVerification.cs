using Calendar.Api.Infrastructure;
using Calendar.Api.Repositories;
using Calendar.Security;
using Microsoft.AspNetCore.Identity;

namespace Calendar.Api.Services;

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
    ISecurityTransaction transaction,
    IAccountRepository accounts,
    IPasswordAttemptRepository failures,
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
        var account = await transaction.RunAsync(
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
        return await transaction.RunAsync(
            async () =>
            {
                var current = await accounts.FindByIdAsync(account.Id);
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
            throw new AccountFailureException(
                AccountFailure.Conflict,
                "Account changed; retry authentication"
            );
    }

    private async Task ClearAsync(Guid id)
    {
        await failures.ClearAsync(id);
        await accounts.SetLockedUntilAsync(id, null);
    }

    private async Task FailAsync(Guid id)
    {
        var now = time.GetUtcNow();
        await failures.RemoveExpiredAsync(id, now.AddMinutes(-15));
        await failures.InsertAsync(id, now);
        if (await failures.CountAsync(id) >= 5)
        {
            await accounts.SetLockedUntilAsync(id, now.AddMinutes(15));
            SecurityLog.Event(logger, "account-paused", null, id, "denied");
        }
    }
}

public sealed record VerifiedPassword(Account Account, string? UpgradedHash);
