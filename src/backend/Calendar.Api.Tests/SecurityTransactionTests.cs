using Calendar.Api.Repositories;
using Calendar.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class SecurityTransactionTests(ApiFixture fixture)
{
    [Fact(
        DisplayName = "Given credential and session state, When a security operation fails after writing, Then all participating repositories roll back"
    )]
    public async Task FailedCredentialReplacementRollsBackAllRepositories()
    {
        // Given an active session and a recorded password failure in an isolated database.
        await using var context = await AuthTestContext.CreateAsync(fixture);
        var account = await context.ProvisionAsync();
        await context.LoginAsync(account);
        await context.ExecuteAsync(
            "INSERT INTO password_failures (account_id, occurred_at) VALUES (@Id, @Now)",
            new { account.Id, Now = context.Time.GetUtcNow() }
        );
        using var scope = context.Application.Services.CreateScope();
        var transaction = scope.ServiceProvider.GetRequiredService<ISecurityTransaction>();
        var accounts = scope.ServiceProvider.GetRequiredService<IAccountRepository>();
        var credentials = scope.ServiceProvider.GetRequiredService<AccountCredentialService>();
        var before = (await accounts.FindByIdAsync(account.Id))!;

        // When the operation fails after changing credentials, failures and sessions.
        var action = () =>
            transaction.RunAsync<bool>(
                async () =>
                {
                    await credentials.ReplacePasswordAsync(
                        account.Id,
                        "replacement-hash",
                        temporary: true
                    );
                    throw new InvalidOperationException("Simulated failure before commit.");
                },
                CancellationToken.None
            );

        // Then every table retains its original state and the scope can read again.
        var failure = await Assert.ThrowsAsync<InvalidOperationException>(action);
        Assert.Equal("Simulated failure before commit.", failure.Message);
        var after = (await accounts.FindByIdAsync(account.Id))!;
        Assert.Equal(before.PasswordHash, after.PasswordHash);
        Assert.Equal(before.SecurityVersion, after.SecurityVersion);
        Assert.Equal(before.MustChangePassword, after.MustChangePassword);
        Assert.Equal(before.TemporaryPasswordExpiresAt, after.TemporaryPasswordExpiresAt);
        Assert.Equal(
            1,
            await context.ScalarAsync<int>("SELECT count(*)::int FROM password_failures")
        );
        Assert.Equal(
            0,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM account_sessions WHERE revoked"
            )
        );
        Assert.Equal(1, await context.CountSessionsAsync());
    }

    [Theory(
        DisplayName = "Given no active security transaction, When a repository mutation is attempted, Then it is rejected without changing persisted state"
    )]
    [InlineData("account")]
    [InlineData("session")]
    [InlineData("password-attempt")]
    public async Task RepositoryMutationsRequireSecurityTransaction(string repository)
    {
        // Given repositories resolved together without opening a security transaction.
        await using var context = await AuthTestContext.CreateAsync(fixture);
        using var scope = context.Application.Services.CreateScope();
        var id = Guid.NewGuid();

        // When any participating repository attempts a write directly.
        Func<Task> action = repository switch
        {
            "account" => () =>
                scope
                    .ServiceProvider.GetRequiredService<IAccountRepository>()
                    .SetEnabledAsync(id, false, Guid.NewGuid()),
            "session" => () =>
                scope.ServiceProvider.GetRequiredService<ISessionRepository>().RevokeAllAsync(id),
            "password-attempt" => () =>
                scope
                    .ServiceProvider.GetRequiredService<IPasswordAttemptRepository>()
                    .InsertAsync(id, context.Time.GetUtcNow()),
            _ => throw new ArgumentOutOfRangeException(nameof(repository)),
        };

        // Then the missing transaction fails closed before any database mutation.
        await Assert.ThrowsAsync<InvalidOperationException>(action);
        Assert.Equal(0, await context.ScalarAsync<int>("SELECT count(*)::int FROM accounts"));
        Assert.Equal(
            0,
            await context.ScalarAsync<int>("SELECT count(*)::int FROM password_failures")
        );
        Assert.Equal(0, await context.CountSessionsAsync());
    }
}
