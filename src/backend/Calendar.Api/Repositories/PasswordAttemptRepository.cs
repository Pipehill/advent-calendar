namespace Calendar.Api.Repositories;

public sealed class PasswordAttemptRepository(SecurityTransaction transaction)
    : IPasswordAttemptRepository
{
    public Task ClearAsync(Guid accountId) =>
        transaction.ExecuteAsync(
            "DELETE FROM password_failures WHERE account_id = @Id",
            new { Id = accountId }
        );

    public Task RemoveExpiredAsync(Guid accountId, DateTimeOffset cutoff) =>
        transaction.ExecuteAsync(
            "DELETE FROM password_failures WHERE account_id = @Id AND occurred_at <= @Cutoff",
            new { Id = accountId, Cutoff = cutoff }
        );

    public Task InsertAsync(Guid accountId, DateTimeOffset occurredAt) =>
        transaction.ExecuteAsync(
            "INSERT INTO password_failures (account_id, occurred_at) VALUES (@Id, @Now)",
            new { Id = accountId, Now = occurredAt }
        );

    public Task<int> CountAsync(Guid accountId) =>
        transaction.ScalarAsync<int>(
            "SELECT count(*)::int FROM password_failures WHERE account_id = @Id",
            new { Id = accountId }
        );
}
