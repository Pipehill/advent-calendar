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
    [Fact(
        DisplayName = "Given the API assembly, When embedded SQL resources are read, Then the numbered calendar migration has its stable identity"
    )]
    public void GivenApiAssemblyWhenReadingSqlResourcesThenContainsNumberedCalendarMigration()
    {
        // Given the assembly containing the application migrations.
        var assembly = typeof(DatabaseStartup).Assembly;

        // When embedded SQL resource names are read.
        var scripts = assembly
            .GetManifestResourceNames()
            .Where(name => name.EndsWith(".sql", StringComparison.Ordinal))
            .ToArray();

        // Then the migration has its stable, numbered embedded identity.
        Assert.Equal(["Calendar.Api.Migrations.0001_create_calendars.sql"], scripts);
    }

    [Fact(
        DisplayName = "Given an already migrated database, When migration startup runs again, Then the journal stays unchanged without duplicate entries"
    )]
    public async Task GivenAppliedMigrationsWhenRunningAgainThenPreservesJournalWithoutDuplicates()
    {
        // Given a database with the actual application migration already applied.
        var connectionString = fixture.Database.GetConnectionString();
        await DatabaseStartup.MigrateAsync(connectionString, 1, CancellationToken.None);
        await using var connection = new NpgsqlConnection(connectionString);
        var before = (
            await connection.QueryAsync<string>(
                "SELECT scriptname FROM schemaversions ORDER BY scriptname"
            )
        ).ToArray();

        // When migration startup is repeated.
        await DatabaseStartup.MigrateAsync(connectionString, 1, CancellationToken.None);

        // Then the journal is unchanged and includes the embedded migration.
        Assert.Equal(
            before,
            (
                await connection.QueryAsync<string>(
                    "SELECT scriptname FROM schemaversions ORDER BY scriptname"
                )
            ).ToArray()
        );
        Assert.Contains("Calendar.Api.Migrations.0001_create_calendars.sql", before);
    }

    [Fact(
        DisplayName = "Given a successful script followed by a failing script, When migrations run, Then the first is committed and the second is rolled back"
    )]
    public async Task GivenFailingSecondScriptWhenMigratingThenRetainsFirstAndRollsBackSecond()
    {
        // Given one valid script followed by a script that fails after creating a table.
        var connectionString = fixture.Database.GetConnectionString();
        var upgrader = DeployChanges
            .To.PostgresqlDatabase(connectionString)
            .WithScripts([
                new SqlScript("test_0001_success", "CREATE TABLE migration_success (id INTEGER);"),
                new SqlScript(
                    "test_0002_failure",
                    "CREATE TABLE migration_failure (id INTEGER); SELECT missing_column;"
                ),
            ])
            .WithTransactionPerScript()
            .Build();

        // When both scripts are run with a transaction per script.
        var result = upgrader.PerformUpgrade();

        // Then only the first script's table and journal entry remain committed.
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

    [Fact(
        DisplayName = "Given an unavailable database, When the API starts, Then connection exhaustion prevents HTTP startup"
    )]
    public async Task GivenUnavailableDatabaseWhenStartingApiThenThrowsConnectionFailure()
    {
        // Given an API configured with a database endpoint that cannot connect.
        await using var app = fixture.Application(
            connectionString: "Host=127.0.0.1;Port=1;Database=absent;Username=absent;Password=absent;Timeout=1"
        );

        // When application startup is attempted.
        var startApplication = () => Task.Run(() => app.CreateClient());

        // Then connection exhaustion prevents HTTP startup.
        await Assert.ThrowsAsync<NpgsqlException>(startApplication);
    }

    [Fact(
        DisplayName = "Given a schema that conflicts with the migration, When the API starts, Then startup fails and partial changes are rolled back"
    )]
    public async Task GivenConflictingSchemaWhenStartingApiThenRejectsStartupAndRollsBackMigration()
    {
        // Given a separate database with a table that conflicts with the migration.
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

        // When application startup attempts the actual migration.
        var startApplication = () => Task.Run(() => app.CreateClient());

        // Then startup fails and no partially created doors table remains.
        var error = await Assert.ThrowsAsync<InvalidOperationException>(startApplication);
        Assert.Contains("migrations failed", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Null(await broken.ExecuteScalarAsync<string?>("SELECT to_regclass('doors')::text"));
    }
}
