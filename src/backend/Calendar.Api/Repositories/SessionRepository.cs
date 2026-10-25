using Calendar.Api.Models;

namespace Calendar.Api.Repositories;

public sealed class SessionRepository(SecurityTransaction transaction) : ISessionRepository
{
    public async Task<AccountSession?> FindAsync(Guid id, Guid accountId) =>
        (
            await transaction.QueryAsync<AccountSession>(
                """
                SELECT id, account_id AS AccountId, security_version AS SecurityVersion,
                    created_at AS CreatedAt, expires_at AS ExpiresAt, verified_at AS VerifiedAt,
                    is_restricted AS Restricted, revoked FROM account_sessions WHERE id = @Id AND account_id = @AccountId
                """,
                new { Id = id, AccountId = accountId }
            )
        ).SingleOrDefault();

    public Task InsertAsync(AccountSession session) =>
        transaction.ExecuteAsync(
            """
            INSERT INTO account_sessions (id, account_id, security_version, created_at,
                expires_at, verified_at, is_restricted) VALUES (@Id, @AccountId, @SecurityVersion,
                @CreatedAt, @ExpiresAt, @VerifiedAt, @Restricted)
            """,
            session
        );

    public Task SetVerifiedAtAsync(Guid id, DateTimeOffset verifiedAt) =>
        transaction.ExecuteAsync(
            "UPDATE account_sessions SET verified_at = @Now WHERE id = @Id",
            new { Id = id, Now = verifiedAt }
        );

    public Task RevokeAsync(Guid id) =>
        transaction.ExecuteAsync(
            "UPDATE account_sessions SET revoked = true WHERE id = @Id",
            new { Id = id }
        );

    public Task RevokeAllAsync(Guid accountId) =>
        transaction.ExecuteAsync(
            "UPDATE account_sessions SET revoked = true WHERE account_id = @Id",
            new { Id = accountId }
        );
}
