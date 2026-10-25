using System.Security.Claims;
using Calendar.Security;
using Microsoft.AspNetCore.Identity;
using Npgsql;

namespace Calendar.Api.Authentication;

public sealed class UserAdministration(
    AuthDatabase database,
    SessionService sessions,
    AuthenticationService authentication,
    UserManager<Account> manager,
    TimeProvider time,
    ILogger<UserAdministration> logger
)
{
    public async Task<Account> CreateAsync(
        ClaimsPrincipal principal,
        string? username,
        string? name,
        string? password,
        string role,
        Guid? responsible,
        CancellationToken cancellationToken
    )
    {
        await database.RunAsync(
            async () =>
            {
                var actor = await sessions.RequireAsync(
                    principal,
                    administrator: true,
                    recent: true
                );
                CanCreate(actor.Account, role, responsible);
                return true;
            },
            cancellationToken
        );
        name = name?.Trim();
        if (!AccountDisplayNames.IsValid(name))
            throw new AuthFailureException(400, "Invalid name", "name");
        if (!AccountNames.IsValid(username))
            throw new AuthFailureException(400, "Invalid username", "username");
        await authentication.ValidatePasswordAsync(role, password);
        var hash = manager.PasswordHasher.HashPassword(new Account(), password!);
        try
        {
            return await database.RunAsync(
                async () =>
                {
                    var actor = await sessions.RequireAsync(
                        principal,
                        administrator: true,
                        recent: true
                    );
                    CanCreate(actor.Account, role, responsible);
                    var owner =
                        role == AccountRoles.User
                            ? actor.Account.Role == AccountRoles.Administrator
                                ? actor.Account.Id
                                : responsible
                            : null;
                    if (role == AccountRoles.User)
                        await RequireResponsibleAsync(owner);
                    var now = time.GetUtcNow();
                    var account = new Account
                    {
                        Id = Guid.NewGuid(),
                        UserName = username!,
                        Name = name!,
                        Role = role,
                        PasswordHash = hash,
                        SecurityVersion = Guid.NewGuid(),
                        MustChangePassword = true,
                        TemporaryPasswordExpiresAt = now.AddMinutes(30),
                        CreatedAt = now,
                        ResponsibleAdministratorId = owner,
                        CreatedById = actor.Account.Id,
                    };
                    var result = await manager.CreateAsync(account);
                    if (!result.Succeeded)
                    {
                        var duplicate = result.Errors.Any(error =>
                            error.Code == "DuplicateUserName"
                        );
                        throw new AuthFailureException(
                            duplicate ? 409 : 400,
                            duplicate ? "Username is reserved" : "Invalid account",
                            "username"
                        );
                    }
                    SecurityLog.Event(
                        logger,
                        "create-user",
                        actor.Account.Id,
                        account.Id,
                        "accepted"
                    );
                    return account;
                },
                cancellationToken
            );
        }
        catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            throw new AuthFailureException(409, "Username is reserved", "username");
        }
    }

    public Task<IEnumerable<Account>> ListAsync(
        ClaimsPrincipal principal,
        int offset,
        int limit,
        CancellationToken cancellationToken
    )
    {
        if (offset is < 0 or > 1000000 || limit is < 1 or > 100)
            throw new AuthFailureException(400, "Invalid pagination");
        return database.RunAsync(
            async () =>
            {
                var actor = await sessions.RequireAsync(principal, administrator: true);
                // Query only authorized metadata, never credentials or lockout state.
                return await database.QueryAsync<Account>(
                    """
                    SELECT id, name, user_name AS UserName, account_role AS Role, enabled,
                        responsible_administrator_id AS ResponsibleAdministratorId,
                        created_by_id AS CreatedById, created_at AS CreatedAt
                    FROM accounts WHERE @Superadmin OR (account_role = 'calendarUser' AND responsible_administrator_id = @ActorId)
                    ORDER BY normalized_user_name, id LIMIT @Limit OFFSET @Offset
                    """,
                    new
                    {
                        Superadmin = actor.Account.Role == AccountRoles.Superadmin,
                        ActorId = actor.Account.Id,
                        Limit = limit,
                        Offset = offset,
                    }
                );
            },
            cancellationToken
        );
    }

    public async Task ResetPasswordAsync(
        ClaimsPrincipal principal,
        Guid id,
        string? password,
        CancellationToken cancellationToken
    )
    {
        var snapshot = await database.RunAsync(
            async () =>
            {
                var actor = await sessions.RequireAsync(
                    principal,
                    administrator: true,
                    recent: true
                );
                return await ResetTargetAsync(actor.Account, id);
            },
            cancellationToken
        );
        var hash = await ReplacementHashAsync(snapshot, password);
        await database.RunAsync(
            async () =>
            {
                var actor = await sessions.RequireAsync(
                    principal,
                    administrator: true,
                    recent: true
                );
                var target = await ResetTargetAsync(actor.Account, id);
                RequireSameVersion(target, snapshot);
                await authentication.ReplacePasswordAsync(id, hash, temporary: true);
                SecurityLog.Event(logger, "reset-password", actor.Account.Id, id, "accepted");
                return true;
            },
            cancellationToken
        );
    }

    public Task<bool> ChangeStatusAsync(
        ClaimsPrincipal principal,
        Guid id,
        bool enabled,
        CancellationToken cancellationToken
    ) =>
        database.RunAsync(
            async () =>
            {
                var actor = await RequireSuperadminAsync(principal);
                await OtherTargetAsync(actor.Account, id);
                await database.ExecuteAsync(
                    "UPDATE accounts SET enabled = @Enabled, security_version = @Version WHERE id = @Id",
                    new
                    {
                        Id = id,
                        Enabled = enabled,
                        Version = Guid.NewGuid(),
                    }
                );
                await authentication.RevokeAsync(id);
                SecurityLog.Event(
                    logger,
                    enabled ? "enable-user" : "disable-user",
                    actor.Account.Id,
                    id,
                    "accepted"
                );
                return true;
            },
            cancellationToken
        );

    public async Task ChangeRoleAsync(
        ClaimsPrincipal principal,
        Guid id,
        string role,
        string? temporaryPassword,
        Guid? responsible,
        CancellationToken cancellationToken
    )
    {
        if (role is not (AccountRoles.Administrator or AccountRoles.User))
            throw new AuthFailureException(400, "Invalid assignable role", "role");
        var snapshot = await database.RunAsync(
            async () =>
            {
                var actor = await RequireSuperadminAsync(principal);
                var target = await OtherTargetAsync(actor.Account, id);
                if (target.Role == role)
                    throw new AuthFailureException(409, "Account already has this role");
                return target;
            },
            cancellationToken
        );
        string? hash = null;
        if (role == AccountRoles.Administrator)
        {
            if (responsible is not null)
                throw new AuthFailureException(
                    400,
                    "Responsibility cannot be changed",
                    "responsibleAdministratorId"
                );
            hash = await ReplacementHashAsync(snapshot, temporaryPassword, role);
        }
        else if (temporaryPassword is not null)
            throw new AuthFailureException(
                400,
                "Temporary password is only accepted for promotion",
                "temporaryPassword"
            );

        await database.RunAsync(
            async () =>
            {
                var actor = await RequireSuperadminAsync(principal);
                var target = await OtherTargetAsync(actor.Account, id);
                RequireSameVersion(target, snapshot);
                if (role == AccountRoles.User)
                {
                    if (
                        await database.ScalarAsync<bool>(
                            "SELECT EXISTS (SELECT 1 FROM accounts WHERE responsible_administrator_id = @Id AND account_role = 'calendarUser')",
                            new { Id = id }
                        )
                    )
                        throw new AuthFailureException(
                            409,
                            "Administrator still has ordinary users"
                        );
                    if (
                        target.ResponsibleAdministratorId is not null
                        && responsible is not null
                        && responsible != target.ResponsibleAdministratorId
                    )
                        throw new AuthFailureException(409, "Account responsibility is immutable");
                    var owner = target.ResponsibleAdministratorId ?? responsible;
                    if (owner == id)
                        throw new AuthFailureException(
                            400,
                            "Account cannot be responsible for itself"
                        );
                    await RequireResponsibleAsync(owner);
                    await database.ExecuteAsync(
                        "UPDATE accounts SET responsible_administrator_id = @Owner WHERE id = @Id",
                        new { Id = id, Owner = owner }
                    );
                }
                await database.ExecuteAsync(
                    "UPDATE accounts SET account_role = @Role, security_version = @Version WHERE id = @Id",
                    new
                    {
                        Id = id,
                        Role = role,
                        Version = Guid.NewGuid(),
                    }
                );
                if (hash is not null)
                    await authentication.ReplacePasswordAsync(id, hash, temporary: true);
                else
                    await authentication.RevokeAsync(id);
                SecurityLog.Event(logger, "change-role", actor.Account.Id, id, "accepted");
                return true;
            },
            cancellationToken
        );
    }

    private async Task<AuthenticatedAccount> RequireSuperadminAsync(ClaimsPrincipal principal)
    {
        var actor = await sessions.RequireAsync(principal, administrator: true, recent: true);
        if (actor.Account.Role != AccountRoles.Superadmin)
            throw new AuthFailureException(403, "Superadmin required");
        return actor;
    }

    private async Task<Account> ResetTargetAsync(Account actor, Guid id)
    {
        var target = await OtherTargetAsync(actor, id);
        if (
            actor.Role != AccountRoles.Superadmin
            && (target.Role != AccountRoles.User || target.ResponsibleAdministratorId != actor.Id)
        )
            throw new AuthFailureException(403, "Operation is not permitted");
        return target;
    }

    private async Task<Account> OtherTargetAsync(Account actor, Guid id)
    {
        var target = await database.FindAsync("id = @Id", new { Id = id });
        if (target is null || target.Role == AccountRoles.Superadmin || target.Id == actor.Id)
            throw new AuthFailureException(403, "Operation is not permitted");
        return target;
    }

    private async Task RequireResponsibleAsync(Guid? id)
    {
        var owner = id is null ? null : await database.FindAsync("id = @Id", new { Id = id.Value });
        if (owner is null || owner.Role != AccountRoles.Administrator)
            throw new AuthFailureException(
                400,
                "Select an existing responsible calendaradmin",
                "responsibleAdministratorId"
            );
    }

    private static void CanCreate(Account actor, string role, Guid? responsible)
    {
        if (
            role is not (AccountRoles.User or AccountRoles.Administrator)
            || (actor.Role == AccountRoles.Administrator && role != AccountRoles.User)
        )
            throw new AuthFailureException(403, "Role creation is not permitted");
        if (
            (actor.Role == AccountRoles.Administrator || role == AccountRoles.Administrator)
            && responsible is not null
        )
            throw new AuthFailureException(
                400,
                "Responsibility is derived from the account operation",
                "responsibleAdministratorId"
            );
    }

    private async Task<string> ReplacementHashAsync(
        Account target,
        string? password,
        string? role = null
    )
    {
        await authentication.ValidatePasswordAsync(role ?? target.Role, password);
        if (
            manager.PasswordHasher.VerifyHashedPassword(target, target.PasswordHash, password!)
            != PasswordVerificationResult.Failed
        )
            throw new AuthFailureException(409, "Replacement password must differ", "password");
        return manager.PasswordHasher.HashPassword(target, password!);
    }

    private static void RequireSameVersion(Account current, Account snapshot)
    {
        if (
            current.SecurityVersion != snapshot.SecurityVersion
            || current.PasswordHash != snapshot.PasswordHash
        )
            throw new AuthFailureException(409, "Target account changed; retry the operation");
    }
}
