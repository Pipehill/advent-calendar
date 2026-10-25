using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;
using Xunit;

namespace Calendar.Api.Tests;

public sealed class ApiFixture : IAsyncLifetime
{
    public string KeyDirectory { get; } =
        Path.Combine(Path.GetTempPath(), "advent-auth-test-keys", Guid.NewGuid().ToString("N"));
    public string CertificatePath => Path.Combine(KeyDirectory, "test-protection.pfx");
    public PostgreSqlContainer Database { get; } =
        new PostgreSqlBuilder(
            "docker.io/library/postgres:18.4@sha256:4cc13dede823cab4e05290c7fb3350fb4e599ecabd9b07e6706b5d5e8f5bc929"
        )
            .WithDatabase("calendar_tests")
            .WithUsername("tests")
            .WithPassword("isolated-tests")
            .Build();

    public async Task InitializeAsync()
    {
        Directory.CreateDirectory(KeyDirectory);
        Directory.CreateDirectory(Path.Combine(KeyDirectory, "production"));
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest(
            "CN=Isolated authentication test",
            rsa,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1
        );
        using var certificate = request.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddDays(-1),
            DateTimeOffset.UtcNow.AddDays(2)
        );
        await File.WriteAllBytesAsync(CertificatePath, certificate.Export(X509ContentType.Pfx));
        await Database.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await Database.DisposeAsync();
        Directory.Delete(KeyDirectory, recursive: true);
    }

    public WebApplicationFactory<Program> Application(
        string environment = "Testing",
        string? connectionString = null,
        TimeProvider? time = null
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
                            ["Database:StartupAttempts"] = "1",
                            ["Authentication:KeyDirectory"] =
                                environment == "Production"
                                    ? Path.Combine(KeyDirectory, "production")
                                    : KeyDirectory,
                            ["Authentication:KeyCertificatePath"] = CertificatePath,
                        }
                    )
            );
            if (time is not null)
                builder.ConfigureServices(services => services.AddSingleton(time));
        });
}

[CollectionDefinition("PostgreSQL")]
public sealed class DatabaseFixtureGroup : ICollectionFixture<ApiFixture>;
