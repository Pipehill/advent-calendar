using Calendar.Api.Repositories;
using Calendar.Security;
using Microsoft.AspNetCore.Identity;

namespace Calendar.Api.Services;

// Shared credential rules for own-password changes and authorized administration.
public sealed class AccountCredentialService(
    IAccountRepository accounts,
    ISessionRepository sessions,
    IPasswordAttemptRepository attempts,
    UserManager<Account> manager,
    TimeProvider time
)
{
    public string HashPassword(Account account, string password) =>
        manager.PasswordHasher.HashPassword(account, password);

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
                throw new AccountFailureException(
                    AccountFailure.InvalidInput,
                    result.Errors.First().Description,
                    "password"
                );
        }
    }

    // The caller holds the shared transaction and has rechecked actor and target.
    public async Task ReplacePasswordAsync(Guid id, string hash, bool temporary)
    {
        await accounts.ReplacePasswordAsync(
            id,
            hash,
            Guid.NewGuid(),
            temporary,
            temporary ? time.GetUtcNow().AddMinutes(30) : null
        );
        await attempts.ClearAsync(id);
        await sessions.RevokeAllAsync(id);
    }
}
