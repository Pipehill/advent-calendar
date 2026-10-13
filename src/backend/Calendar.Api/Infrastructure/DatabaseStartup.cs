using DbUp;
using Npgsql;

namespace Calendar.Api.Infrastructure;

public sealed class MigrationState
{
    public bool Complete { get; set; }
}

public static class DatabaseStartup
{
    public static async Task MigrateAsync(
        string connectionString,
        int attempts,
        CancellationToken cancellationToken
    )
    {
        if (attempts is < 1 or > 30)
            throw new ArgumentOutOfRangeException(nameof(attempts));
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await using var connection = new NpgsqlConnection(connectionString);
                await connection.OpenAsync(cancellationToken);
                break;
            }
            catch (NpgsqlException) when (attempt < attempts)
            {
                await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
            }
        }

        var result = DeployChanges
            .To.PostgresqlDatabase(connectionString)
            .WithScriptsEmbeddedInAssembly(typeof(DatabaseStartup).Assembly)
            .WithTransactionPerScript()
            .Build()
            .PerformUpgrade();
        if (!result.Successful)
            throw new InvalidOperationException("Database migrations failed.", result.Error);
    }
}
