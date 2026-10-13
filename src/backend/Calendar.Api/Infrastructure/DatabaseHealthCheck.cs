using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

namespace Calendar.Api.Infrastructure;

public sealed class DatabaseHealthCheck(NpgsqlDataSource source, MigrationState migrations)
    : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken
    )
    {
        if (!migrations.Complete)
            return HealthCheckResult.Unhealthy("Migrations incomplete.");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(2));
        try
        {
            await using var connection = await source.OpenConnectionAsync(deadline.Token);
            await using var command = new NpgsqlCommand("SELECT 1", connection);
            await command.ExecuteScalarAsync(deadline.Token);
            return HealthCheckResult.Healthy();
        }
        catch (Exception exception)
            when (exception is NpgsqlException or OperationCanceledException)
        {
            return HealthCheckResult.Unhealthy("Database unavailable.", exception);
        }
    }
}
