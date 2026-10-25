using Dapper;
using Npgsql;

namespace Calendar.Api.Repositories;

public sealed class SecurityTransaction(NpgsqlDataSource dataSource) : ISecurityTransaction
{
    private NpgsqlConnection? connection;
    private NpgsqlTransaction? transaction;
    private CancellationToken cancellationToken;

    public async Task<T> RunAsync<T>(Func<Task<T>> operation, CancellationToken cancellationToken)
    {
        if (transaction is not null)
            throw new InvalidOperationException("Security transactions cannot be nested.");

        await using var opened = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var started = await opened.BeginTransactionAsync(cancellationToken);
        // Preserve the cross-instance ordering of actor, target and session changes.
        // Expensive password hashing remains outside this short transaction.
        await opened.ExecuteAsync(
            new CommandDefinition(
                "SELECT pg_advisory_xact_lock(800008)",
                transaction: started,
                cancellationToken: cancellationToken
            )
        );
        connection = opened;
        transaction = started;
        this.cancellationToken = cancellationToken;
        try
        {
            var result = await operation();
            await started.CommitAsync(cancellationToken);
            return result;
        }
        finally
        {
            connection = null;
            transaction = null;
            this.cancellationToken = default;
        }
    }

    internal Task<int> ExecuteAsync(string sql, object? parameters = null) =>
        RequireConnection().ExecuteAsync(Command(sql, parameters));

    internal Task<T> ScalarAsync<T>(string sql, object? parameters = null) =>
        RequireConnection().ExecuteScalarAsync<T>(Command(sql, parameters))!;

    internal Task<IEnumerable<T>> QueryAsync<T>(string sql, object? parameters = null) =>
        RequireConnection().QueryAsync<T>(Command(sql, parameters));

    // Identity also performs standalone read-only lookups. Within an operation,
    // the same query must use the operation's connection, lock and snapshot.
    internal async Task<T?> FindAsync<T>(
        string sql,
        object parameters,
        CancellationToken cancellationToken
    )
    {
        if (connection is not null)
            return await connection.QuerySingleOrDefaultAsync<T>(Command(sql, parameters));

        await using var opened = await dataSource.OpenConnectionAsync(cancellationToken);
        return await opened.QuerySingleOrDefaultAsync<T>(
            new CommandDefinition(sql, parameters, cancellationToken: cancellationToken)
        );
    }

    private CommandDefinition Command(string sql, object? parameters) =>
        new(sql, parameters, transaction, cancellationToken: cancellationToken);

    private NpgsqlConnection RequireConnection() =>
        connection
        ?? throw new InvalidOperationException(
            "Account writes and security reads require an authorized security transaction."
        );
}
