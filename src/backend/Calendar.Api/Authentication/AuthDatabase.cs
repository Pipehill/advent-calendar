using Calendar.Security;
using Dapper;
using Npgsql;

namespace Calendar.Api.Authentication;

public sealed class AuthDatabase(NpgsqlDataSource dataSource)
{
    // A short database-wide advisory transaction lock orders security decisions
    // across instances, including actor revocation and responsibility dependencies.
    // Password verification and replacement hashing happen outside this lock.
    public NpgsqlConnection? Connection { get; private set; }
    public NpgsqlTransaction? Transaction { get; private set; }

    public async Task<T> RunAsync<T>(Func<Task<T>> operation, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await connection.ExecuteAsync(
            new CommandDefinition(
                "SELECT pg_advisory_xact_lock(800008)",
                transaction: transaction,
                cancellationToken: cancellationToken
            )
        );
        Connection = connection;
        Transaction = transaction;
        try
        {
            var result = await operation();
            await transaction.CommitAsync(cancellationToken);
            return result;
        }
        finally
        {
            Connection = null;
            Transaction = null;
        }
    }

    public Task<int> ExecuteAsync(string sql, object? parameters = null) =>
        Connection!.ExecuteAsync(sql, parameters, Transaction);

    public Task<T> ScalarAsync<T>(string sql, object? parameters = null) =>
        Connection!.ExecuteScalarAsync<T>(sql, parameters, Transaction)!;

    public Task<IEnumerable<T>> QueryAsync<T>(string sql, object? parameters = null) =>
        Connection!.QueryAsync<T>(sql, parameters, Transaction);

    public async Task<Account?> FindAsync(
        string predicate,
        object parameters,
        CancellationToken cancellationToken = default
    )
    {
        const string columns = """
            SELECT id, user_name AS UserName, normalized_user_name AS NormalizedUserName,
                password_hash AS PasswordHash, account_role AS Role, enabled, security_version AS SecurityVersion,
                must_change_password AS MustChangePassword,
                temporary_password_expires_at AS TemporaryPasswordExpiresAt,
                locked_until AS LockedUntil, responsible_administrator_id AS ResponsibleAdministratorId,
                created_by_id AS CreatedById, created_at AS CreatedAt
            FROM accounts WHERE
            """;
        if (Connection is not null)
            return await Connection.QuerySingleOrDefaultAsync<Account>(
                columns + " " + predicate,
                parameters,
                Transaction
            );
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        return await connection.QuerySingleOrDefaultAsync<Account>(
            new CommandDefinition(
                columns + " " + predicate,
                parameters,
                cancellationToken: cancellationToken
            )
        );
    }
}

public sealed class AuthFailureException(int status, string message, string? field = null)
    : Exception(message)
{
    public int Status { get; } = status;
    public string? Field { get; } = field;
}

public sealed class AccountSession
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    public Guid SecurityVersion { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? VerifiedAt { get; set; }
    public bool Restricted { get; set; }
    public bool Revoked { get; set; }
}

public sealed record AuthenticatedAccount(Account Account, AccountSession Session);
