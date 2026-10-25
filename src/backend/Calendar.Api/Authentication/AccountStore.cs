using Calendar.Security;
using Microsoft.AspNetCore.Identity;

namespace Calendar.Api.Authentication;

// Writes are available only inside the authorization service's transaction.
// Identity never bypasses the actor/session/target concurrency boundary.
public sealed class AccountStore(AuthDatabase database)
    : IUserPasswordStore<Account>,
        IUserRoleStore<Account>
{
    public void Dispose() { }

    public Task<string> GetUserIdAsync(Account user, CancellationToken cancellationToken) =>
        Task.FromResult(user.Id.ToString());

    public Task<string?> GetUserNameAsync(Account user, CancellationToken cancellationToken) =>
        Task.FromResult<string?>(user.UserName);

    public Task SetUserNameAsync(
        Account user,
        string? userName,
        CancellationToken cancellationToken
    )
    {
        user.UserName = userName!;
        return Task.CompletedTask;
    }

    public Task<string?> GetNormalizedUserNameAsync(
        Account user,
        CancellationToken cancellationToken
    ) => Task.FromResult<string?>(user.NormalizedUserName);

    public Task SetNormalizedUserNameAsync(
        Account user,
        string? normalizedName,
        CancellationToken cancellationToken
    )
    {
        user.NormalizedUserName = normalizedName!;
        return Task.CompletedTask;
    }

    public Task<Account?> FindByIdAsync(string userId, CancellationToken cancellationToken) =>
        database.FindAsync("id = @Id", new { Id = Guid.Parse(userId) }, cancellationToken);

    public Task<Account?> FindByNameAsync(
        string normalizedUserName,
        CancellationToken cancellationToken
    ) =>
        database.FindAsync(
            "normalized_user_name = @Name",
            new { Name = normalizedUserName },
            cancellationToken
        );

    public Task SetPasswordHashAsync(
        Account user,
        string? passwordHash,
        CancellationToken cancellationToken
    )
    {
        user.PasswordHash = passwordHash!;
        return Task.CompletedTask;
    }

    public Task<string?> GetPasswordHashAsync(Account user, CancellationToken cancellationToken) =>
        Task.FromResult<string?>(user.PasswordHash);

    public Task<bool> HasPasswordAsync(Account user, CancellationToken cancellationToken) =>
        Task.FromResult(user.PasswordHash.Length > 0);

    public Task<IList<string>> GetRolesAsync(Account user, CancellationToken cancellationToken) =>
        Task.FromResult<IList<string>>([user.Role]);

    public Task<bool> IsInRoleAsync(
        Account user,
        string roleName,
        CancellationToken cancellationToken
    ) => Task.FromResult(AccountNames.Normalize(user.Role) == roleName);

    public async Task<IdentityResult> CreateAsync(Account user, CancellationToken cancellationToken)
    {
        RequireTransaction();
        if (user.Role == AccountRoles.Superadmin)
            throw new InvalidOperationException(
                "Superadmins require manual database provisioning."
            );
        await database.ExecuteAsync(
            """
            INSERT INTO accounts (id, name, user_name, normalized_user_name, password_hash, account_role,
                enabled, security_version, must_change_password, temporary_password_expires_at,
                responsible_administrator_id, created_by_id, created_at)
            VALUES (@Id, @Name, @UserName, @NormalizedUserName, @PasswordHash, @Role, @Enabled,
                @SecurityVersion, @MustChangePassword, @TemporaryPasswordExpiresAt,
                @ResponsibleAdministratorId, @CreatedById, @CreatedAt)
            """,
            user
        );
        return IdentityResult.Success;
    }

    public async Task<IdentityResult> UpdateAsync(Account user, CancellationToken cancellationToken)
    {
        RequireTransaction();
        var changed = await database.ExecuteAsync(
            """
            UPDATE accounts SET password_hash = @PasswordHash WHERE id = @Id
                AND security_version = @SecurityVersion
            """,
            user
        );
        return changed == 1
            ? IdentityResult.Success
            : IdentityResult.Failed(new IdentityError { Code = "ConcurrencyFailure" });
    }

    // Role changes/deletion cannot go through generic Identity methods: those do
    // not carry the required actor, responsibility and credential handover inputs.
    public Task<IdentityResult> DeleteAsync(Account user, CancellationToken cancellationToken) =>
        throw new NotSupportedException();

    public Task AddToRoleAsync(
        Account user,
        string roleName,
        CancellationToken cancellationToken
    ) => throw new NotSupportedException();

    public Task RemoveFromRoleAsync(
        Account user,
        string roleName,
        CancellationToken cancellationToken
    ) => throw new NotSupportedException();

    public Task<IList<Account>> GetUsersInRoleAsync(
        string roleName,
        CancellationToken cancellationToken
    ) => throw new NotSupportedException("Use the authorized bounded SQL account list.");

    private void RequireTransaction()
    {
        if (database.Transaction is null)
            throw new InvalidOperationException(
                "Account writes require an authorized security transaction."
            );
    }
}

public sealed class AccountValidator : IUserValidator<Account>
{
    public async Task<IdentityResult> ValidateAsync(UserManager<Account> manager, Account user)
    {
        if (!AccountDisplayNames.IsValid(user.Name))
            return IdentityResult.Failed(
                new IdentityError
                {
                    Code = "InvalidName",
                    Description = "Use 1-100 Unicode characters for the name.",
                }
            );
        if (!AccountNames.IsValid(user.UserName))
            return IdentityResult.Failed(
                new IdentityError
                {
                    Code = "InvalidUserName",
                    Description = "Use 3-64 letters, digits, dot, hyphen or underscore.",
                }
            );
        var existing = await manager.FindByNameAsync(user.UserName);
        return existing is null || existing.Id == user.Id
            ? IdentityResult.Success
            : IdentityResult.Failed(
                new IdentityError
                {
                    Code = "DuplicateUserName",
                    Description = "Username is reserved.",
                }
            );
    }
}
