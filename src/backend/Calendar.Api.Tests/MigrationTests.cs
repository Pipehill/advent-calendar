using Calendar.Api.Infrastructure;
using Dapper;
using DbUp;
using DbUp.Engine;
using Npgsql;
using Xunit;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class MigrationTests(ApiFixture fixture)
{
    [Fact]
    public async Task EmbeddedIdentityJournalAndRestart()
    {
        var scripts = typeof(DatabaseStartup)
            .Assembly.GetManifestResourceNames()
            .Where(name => name.EndsWith(".sql", StringComparison.Ordinal))
            .ToArray();
        Assert.Equal(["Calendar.Api.Migrations.0001_create_calendars.sql"], scripts);
        var connectionString = fixture.Database.GetConnectionString();
        await DatabaseStartup.MigrateAsync(connectionString, 1, CancellationToken.None);
        await using var connection = new NpgsqlConnection(connectionString);
        var before = (
            await connection.QueryAsync<string>(
                "SELECT scriptname FROM schemaversions ORDER BY scriptname"
            )
        ).ToArray();
        await DatabaseStartup.MigrateAsync(connectionString, 1, CancellationToken.None);
        Assert.Equal(
            before,
            (
                await connection.QueryAsync<string>(
                    "SELECT scriptname FROM schemaversions ORDER BY scriptname"
                )
            ).ToArray()
        );
        Assert.Contains(scripts[0], before);
    }

    [Fact]
    public async Task TransactionPerScriptRetainsEarlierSuccessAndRollsBackFailure()
    {
        var connectionString = fixture.Database.GetConnectionString();
        var result = DeployChanges
            .To.PostgresqlDatabase(connectionString)
            .WithScripts([
                new SqlScript("test_0001_success", "CREATE TABLE migration_success (id INTEGER);"),
                new SqlScript(
                    "test_0002_failure",
                    "CREATE TABLE migration_failure (id INTEGER); SELECT missing_column;"
                ),
            ])
            .WithTransactionPerScript()
            .Build()
            .PerformUpgrade();
        Assert.False(result.Successful);
        await using var connection = new NpgsqlConnection(connectionString);
        Assert.NotNull(
            await connection.ExecuteScalarAsync<string?>(
                "SELECT to_regclass('migration_success')::text"
            )
        );
        Assert.Null(
            await connection.ExecuteScalarAsync<string?>(
                "SELECT to_regclass('migration_failure')::text"
            )
        );
        Assert.Equal(
            1,
            await connection.ExecuteScalarAsync<int>(
                "SELECT count(*)::int FROM schemaversions WHERE scriptname = 'test_0001_success'"
            )
        );
        Assert.Equal(
            0,
            await connection.ExecuteScalarAsync<int>(
                "SELECT count(*)::int FROM schemaversions WHERE scriptname = 'test_0002_failure'"
            )
        );
    }

    [Fact]
    public async Task ExhaustedConnectionsPreventApplicationStartup()
    {
        await using var app = fixture.Application(
            connectionString: "Host=127.0.0.1;Port=1;Database=absent;Username=absent;Password=absent;Timeout=1"
        );
        await Assert.ThrowsAsync<NpgsqlException>(() => Task.Run(() => app.CreateClient()));
    }

    [Fact]
    public async Task FailedApplicationMigrationPreventsStartup()
    {
        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());
        await connection.ExecuteAsync("CREATE DATABASE migration_start_failure");
        var configuration = new NpgsqlConnectionStringBuilder(
            fixture.Database.GetConnectionString()
        )
        {
            Database = "migration_start_failure",
        };
        await using var broken = new NpgsqlConnection(configuration.ConnectionString);
        await broken.ExecuteAsync("CREATE TABLE calendars (id INTEGER)");
        await using var app = fixture.Application(connectionString: configuration.ConnectionString);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Task.Run(() => app.CreateClient())
        );
        Assert.Contains("migrations failed", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Null(await broken.ExecuteScalarAsync<string?>("SELECT to_regclass('doors')::text"));
    }
}
