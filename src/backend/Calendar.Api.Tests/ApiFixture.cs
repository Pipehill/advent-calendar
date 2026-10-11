using Calendar.Api.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Testcontainers.PostgreSql;
using Xunit;

namespace Calendar.Api.Tests;

public sealed class ApiFixture : IAsyncLifetime
{
    public PostgreSqlContainer Database { get; } =
        new PostgreSqlBuilder(
            "docker.io/library/postgres:18.4@sha256:4cc13dede823cab4e05290c7fb3350fb4e599ecabd9b07e6706b5d5e8f5bc929"
        )
            .WithDatabase("calendar_tests")
            .WithUsername("tests")
            .WithPassword("isolated-tests")
            .Build();

    public async Task InitializeAsync() => await Database.StartAsync();

    public async Task DisposeAsync() => await Database.DisposeAsync();

    public WebApplicationFactory<Program> Application(
        string environment = "Testing",
        bool seed = false,
        string? connectionString = null
    ) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);
            builder.ConfigureAppConfiguration(
                (_, configuration) =>
                    configuration.AddInMemoryCollection(
                        new Dictionary<string, string?>
                        {
                            ["ConnectionStrings:Calendar"] =
                                connectionString ?? Database.GetConnectionString(),
                            ["LocalSeed:Enabled"] = seed.ToString(),
                            ["Database:StartupAttempts"] = "1",
                        }
                    )
            );
        });
}

[CollectionDefinition("PostgreSQL")]
public sealed class DatabaseFixtureGroup : ICollectionFixture<ApiFixture>;
