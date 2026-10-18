using System.Net.Http.Json;
using Calendar.Api.Generated;
using Calendar.Security;
using Dapper;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace Calendar.Api.Tests;

internal sealed class AuthTestContext : IAsyncDisposable
{
    public required string ConnectionString { get; init; }
    public required WebApplicationFactory<Program> Application { get; init; }
    public required HttpClient Client { get; init; }
    public required TestTime Time { get; init; }

    public static async Task<AuthTestContext> CreateAsync(
        ApiFixture fixture,
        bool seed = false,
        Action<IServiceCollection>? configureServices = null
    )
    {
        var name = "auth_" + Guid.NewGuid().ToString("N");
        await using var connection = new NpgsqlConnection(fixture.Database.GetConnectionString());
        // The identifier is generated here, never user input; parameters cannot name a database.
        await connection.ExecuteAsync($"CREATE DATABASE {name}");
        var connectionString = new NpgsqlConnectionStringBuilder(
            fixture.Database.GetConnectionString()
        )
        {
            Database = name,
        }.ConnectionString;
        var time = new TestTime();
        var app = fixture.Application(
            seed ? "Development" : "Testing",
            seed,
            connectionString,
            time
        );
        if (configureServices is not null)
            app = app.WithWebHostBuilder(builder => builder.ConfigureServices(configureServices));
        return new()
        {
            ConnectionString = connectionString,
            Application = app,
            Client = app.CreateClient(),
            Time = time,
        };
    }

    public async Task<TestAccount> ProvisionAsync(
        string role = AccountRoles.Superadmin,
        Guid? responsible = null,
        string? password = null,
        string? username = null
    )
    {
        password ??= Password();
        username ??= "user-" + Guid.NewGuid().ToString("N");
        var id = Guid.NewGuid();
        var hash = new ArgonPasswordHasher().HashPassword(new Account(), password);
        await ExecuteAsync(
            """
            INSERT INTO accounts (id, user_name, normalized_user_name, password_hash, account_role,
                security_version, created_at, responsible_administrator_id)
            VALUES (@Id, @Username, @Normalized, @Hash, @Role, @Version, @Now, @Responsible)
            """,
            new
            {
                Id = id,
                Username = username,
                Normalized = AccountNames.Normalize(username),
                Hash = hash,
                Role = role,
                Version = Guid.NewGuid(),
                Now = Time.GetUtcNow(),
                Responsible = responsible,
            }
        );
        return new(id, username, password, role);
    }

    public Task<int> ExecuteAsync(string sql, object? parameters = null) =>
        ExecuteCoreAsync(sql, parameters);

    private async Task<int> ExecuteCoreAsync(string sql, object? parameters)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        return await connection.ExecuteAsync(sql, parameters);
    }

    public async Task<T> ScalarAsync<T>(string sql, object? parameters = null)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        return (await connection.ExecuteScalarAsync<T>(sql, parameters))!;
    }

    public Task<int> CountSessionsAsync() =>
        ScalarAsync<int>("SELECT count(*)::int FROM account_sessions");

    public static string Password() => "Æa!" + Guid.NewGuid().ToString("N");

    public static async Task<HttpResponseMessage> SendAsync(
        HttpClient client,
        HttpMethod method,
        string path,
        object? body = null,
        bool csrf = true
    )
    {
        using var request = new HttpRequestMessage(method, path);
        if (body is not null)
            request.Content = JsonContent.Create(body);
        if (csrf)
        {
            var token = (await client.GetFromJsonAsync<CsrfDto>("/auth/csrf"))!;
            request.Headers.Add(token.HeaderName, token.RequestToken);
        }
        return await client.SendAsync(request);
    }

    public async Task<SessionDto> LoginAsync(TestAccount account, HttpClient? client = null)
    {
        var response = await SendAsync(
            client ?? Client,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, account.Password }
        );
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<SessionDto>())!;
    }

    public async Task<HttpClient> CreateAuthenticatedClientAsync(TestAccount account)
    {
        var client = Application.CreateClient();
        try
        {
            await LoginAsync(account, client);
            return client;
        }
        catch
        {
            client.Dispose();
            throw;
        }
    }

    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await Application.DisposeAsync();
        // Individual test databases must not leave process-wide manual-SQL pools
        // holding connections until the shared PostgreSQL container is disposed.
        using var connection = new NpgsqlConnection(ConnectionString);
        NpgsqlConnection.ClearPool(connection);
    }
}

internal sealed record TestAccount(Guid Id, string Username, string Password, string Role);

internal sealed class TestTime : TimeProvider
{
    private long ticks = DateTimeOffset.UtcNow.Ticks / 10 * 10;

    public override DateTimeOffset GetUtcNow() => new(Interlocked.Read(ref ticks), TimeSpan.Zero);

    public void Advance(TimeSpan elapsed) => Interlocked.Add(ref ticks, elapsed.Ticks);
}
