using Calendar.Security;
using Npgsql;

namespace Calendar.Api.Repositories;

public sealed class AccountRepository(SecurityTransaction transaction) : IAccountRepository
{
    private const string AccountColumns = """
        SELECT id, name, user_name AS UserName, normalized_user_name AS NormalizedUserName,
            password_hash AS PasswordHash, account_role AS Role, enabled, security_version AS SecurityVersion,
            must_change_password AS MustChangePassword,
            temporary_password_expires_at AS TemporaryPasswordExpiresAt,
            locked_until AS LockedUntil, responsible_administrator_id AS ResponsibleAdministratorId,
            created_by_id AS CreatedById, created_at AS CreatedAt
        FROM accounts WHERE
        """;

    public Task<Account?> FindByIdAsync(Guid id, CancellationToken cancellationToken = default) =>
        transaction.FindAsync<Account>(
            AccountColumns + " id = @Id",
            new { Id = id },
            cancellationToken
        );

    public Task<Account?> FindByNormalizedNameAsync(
        string name,
        CancellationToken cancellationToken
    ) =>
        transaction.FindAsync<Account>(
            AccountColumns + " normalized_user_name = @Name",
            new { Name = name },
            cancellationToken
        );

    public async Task InsertAsync(Account account)
    {
        try
        {
            await transaction.ExecuteAsync(
                """
                INSERT INTO accounts (id, name, user_name, normalized_user_name, password_hash, account_role,
                    enabled, security_version, must_change_password, temporary_password_expires_at,
                    responsible_administrator_id, created_by_id, created_at)
                VALUES (@Id, @Name, @UserName, @NormalizedUserName, @PasswordHash, @Role, @Enabled,
                    @SecurityVersion, @MustChangePassword, @TemporaryPasswordExpiresAt,
                    @ResponsibleAdministratorId, @CreatedById, @CreatedAt)
                """,
                account
            );
        }
        catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            throw new DuplicateAccountException();
        }
    }

    public async Task<bool> TryUpdatePasswordHashAsync(Account account) =>
        await transaction.ExecuteAsync(
            """
            UPDATE accounts SET password_hash = @PasswordHash WHERE id = @Id
                AND security_version = @SecurityVersion
            """,
            account
        ) == 1;

    public Task<IEnumerable<Account>> ListAsync(
        bool allAccounts,
        Guid actorId,
        int offset,
        int limit
    ) =>
        transaction.QueryAsync<Account>(
            """
            SELECT id, name, user_name AS UserName, account_role AS Role, enabled,
                responsible_administrator_id AS ResponsibleAdministratorId,
                created_by_id AS CreatedById, created_at AS CreatedAt
            FROM accounts WHERE @Superadmin OR (account_role = 'calendarUser' AND responsible_administrator_id = @ActorId)
            ORDER BY normalized_user_name, id LIMIT @Limit OFFSET @Offset
            """,
            new
            {
                Superadmin = allAccounts,
                ActorId = actorId,
                Limit = limit,
                Offset = offset,
            }
        );

    public Task SetEnabledAsync(Guid id, bool enabled, Guid securityVersion) =>
        transaction.ExecuteAsync(
            "UPDATE accounts SET enabled = @Enabled, security_version = @Version WHERE id = @Id",
            new
            {
                Id = id,
                Enabled = enabled,
                Version = securityVersion,
            }
        );

    public Task<bool> HasResponsibleUsersAsync(Guid id) =>
        transaction.ScalarAsync<bool>(
            "SELECT EXISTS (SELECT 1 FROM accounts WHERE responsible_administrator_id = @Id AND account_role = 'calendarUser')",
            new { Id = id }
        );

    public Task SetResponsibleAdministratorAsync(Guid id, Guid? responsibleAdministratorId) =>
        transaction.ExecuteAsync(
            "UPDATE accounts SET responsible_administrator_id = @Owner WHERE id = @Id",
            new { Id = id, Owner = responsibleAdministratorId }
        );

    public Task SetRoleAsync(Guid id, string role, Guid securityVersion) =>
        transaction.ExecuteAsync(
            "UPDATE accounts SET account_role = @Role, security_version = @Version WHERE id = @Id",
            new
            {
                Id = id,
                Role = role,
                Version = securityVersion,
            }
        );

    public Task ReplacePasswordAsync(
        Guid id,
        string hash,
        Guid securityVersion,
        bool temporary,
        DateTimeOffset? temporaryPasswordExpiresAt
    ) =>
        transaction.ExecuteAsync(
            """
            UPDATE accounts SET password_hash = @Hash, security_version = @Version,
                must_change_password = @Temporary, temporary_password_expires_at = @Deadline,
                locked_until = NULL WHERE id = @Id
            """,
            new
            {
                Id = id,
                Hash = hash,
                Version = securityVersion,
                Temporary = temporary,
                Deadline = temporaryPasswordExpiresAt,
            }
        );

    public Task SetLockedUntilAsync(Guid id, DateTimeOffset? lockedUntil) =>
        transaction.ExecuteAsync(
            "UPDATE accounts SET locked_until = @Until WHERE id = @Id",
            new { Id = id, Until = lockedUntil }
        );
}

public sealed class DuplicateAccountException : Exception;
