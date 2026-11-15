using System.Net;
using Calendar.Api.Services;
using Calendar.Security;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class PasswordSetupConcurrencyTests(ApiFixture fixture)
{
    private const string Path = "/auth/complete-password-setup";

    [Theory(
        DisplayName = "Given setup paused after comparing its proposal, When authorization expires or security state changes, Then stale setup cannot overwrite current credentials"
    )]
    [InlineData("reset")]
    [InlineData("disable")]
    [InlineData("role")]
    [InlineData("session-expiry")]
    [InlineData("credential-expiry")]
    [InlineData("pause")]
    public async Task SetupRechecksSecurityStateBeforeCommit(string mutation)
    {
        // Given setup paused outside its transaction after actual hash comparison.
        var barrier = new VerificationBarrier(pauseFailed: true);
        await using var context = await CreateAsync(
            fixture,
            configureServices: services => services.AddSingleton<IPasswordVerification>(barrier)
        );
        var target = await context.ProvisionTemporaryAsync();
        await context.LoginAsync(target);
        using var administrator = await context.CreateAuthenticatedClientAsync(
            await context.ProvisionAsync()
        );
        var responsible = await context.ProvisionAsync(AccountRoles.Administrator);
        barrier.PauseAccount(target.Id);
        var pending = SendAsync(
            context.Client,
            HttpMethod.Post,
            Path,
            new { newPassword = Password() }
        );
        await barrier.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));

        // When another operation commits or an exact authorization deadline passes.
        string currentHash;
        try
        {
            HttpResponseMessage? changed = mutation switch
            {
                "reset" => await SendAsync(
                    administrator,
                    HttpMethod.Post,
                    $"/users/{target.Id}/reset-password",
                    new { password = Password() }
                ),
                "disable" => await SendAsync(
                    administrator,
                    HttpMethod.Patch,
                    $"/users/{target.Id}/status",
                    new { enabled = false }
                ),
                "role" => await SendAsync(
                    administrator,
                    HttpMethod.Patch,
                    $"/users/{target.Id}/role",
                    new { role = AccountRoles.User, responsibleAdministratorId = responsible.Id }
                ),
                _ => null,
            };
            if (changed is not null)
                Assert.Equal(HttpStatusCode.NoContent, changed.StatusCode);
            if (mutation == "session-expiry")
                context.Time.Advance(TimeSpan.FromMinutes(10));
            if (mutation == "credential-expiry")
                await context.ExecuteAsync(
                    "UPDATE accounts SET temporary_password_expires_at = @Now WHERE id = @Id",
                    new { target.Id, Now = context.Time.GetUtcNow() }
                );
            if (mutation == "pause")
                await context.ExecuteAsync(
                    "UPDATE accounts SET locked_until = @Until WHERE id = @Id",
                    new { target.Id, Until = context.Time.GetUtcNow().AddMinutes(15) }
                );
            currentHash = await context.ScalarAsync<string>(
                "SELECT password_hash FROM accounts WHERE id = @Id",
                new { target.Id }
            );
        }
        finally
        {
            barrier.Release.TrySetResult();
        }
        var rejected = await pending;

        // Then current account/session state survives the stale prepared replacement.
        Assert.Contains(
            rejected.StatusCode,
            new[] { HttpStatusCode.Unauthorized, HttpStatusCode.Forbidden, HttpStatusCode.Conflict }
        );
        Assert.True(rejected.Headers.CacheControl?.NoStore);
        Assert.Equal(
            currentHash,
            await context.ScalarAsync<string>(
                "SELECT password_hash FROM accounts WHERE id = @Id",
                new { target.Id }
            )
        );
        if (mutation == "reset")
            Assert.True(
                await context.ScalarAsync<bool>(
                    "SELECT must_change_password FROM accounts WHERE id = @Id",
                    new { target.Id }
                )
            );
    }

    [Fact(
        DisplayName = "Given two restricted sessions with concurrent setup proposals, When both comparisons finish, Then exactly one setup commits without counting different passwords as failures"
    )]
    public async Task ConcurrentSetupsHaveOneWinnerWithoutAuthenticationFailures()
    {
        // Given two setup requests paused after their different-password comparisons.
        var barrier = new VerificationBarrier(expected: 2, pauseFailed: true);
        await using var context = await CreateAsync(
            fixture,
            configureServices: services => services.AddSingleton<IPasswordVerification>(barrier)
        );
        var account = await context.ProvisionTemporaryAsync();
        await context.LoginAsync(account);
        using var other = await context.CreateAuthenticatedClientAsync(account);
        await context.ExecuteAsync(
            "INSERT INTO password_failures (account_id, occurred_at) VALUES (@Id, @Now)",
            new { account.Id, Now = context.Time.GetUtcNow() }
        );
        barrier.PauseAccount(account.Id);
        var first = SendAsync(
            context.Client,
            HttpMethod.Post,
            Path,
            new { newPassword = Password() }
        );
        var second = SendAsync(other, HttpMethod.Post, Path, new { newPassword = Password() });

        // When both real comparisons complete without recording authentication failures.
        int failures;
        try
        {
            await barrier.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
            failures = await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM password_failures WHERE account_id = @Id",
                new { account.Id }
            );
        }
        finally
        {
            barrier.Release.TrySetResult();
        }
        var responses = await Task.WhenAll(first, second);

        // Then one commit wins, revokes both sessions and clears the prior failure atomically.
        Assert.Equal(1, failures);
        AssertSinglePasswordReplacementWinner(responses);
        Assert.Equal(
            0,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM account_sessions WHERE account_id = @Id AND NOT revoked",
                new { account.Id }
            )
        );
        Assert.Equal(
            0,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM password_failures WHERE account_id = @Id",
                new { account.Id }
            )
        );
    }

    [Theory(
        DisplayName = "Given replacement hashing in progress, When the session or credential expires at its deadline, Then setup cannot commit"
    )]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ExpiryDuringHashingRejectsSetup(bool credentialExpires)
    {
        // Given real replacement hashing paused before the final security transaction.
        using var barrier = new HashBarrier();
        await using var context = await CreateAsync(
            fixture,
            configureServices: services =>
                services.AddSingleton<Microsoft.AspNetCore.Identity.IPasswordHasher<Account>>(
                    barrier
                )
        );
        var account = await context.ProvisionTemporaryAsync();
        if (credentialExpires)
            await context.ExecuteAsync(
                "UPDATE accounts SET temporary_password_expires_at = @Deadline WHERE id = @Id",
                new { account.Id, Deadline = context.Time.GetUtcNow().AddMinutes(5) }
            );
        await context.LoginAsync(account);
        var hash = await context.ScalarAsync<string>(
            "SELECT password_hash FROM accounts WHERE id = @Id",
            new { account.Id }
        );
        barrier.PauseAccount(account.Id);
        var pending = Task.Run(() =>
            SendAsync(context.Client, HttpMethod.Post, Path, new { newPassword = Password() })
        );

        // When the backend clock reaches the original deadline while hashing is paused.
        try
        {
            await barrier.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
            context.Time.Advance(TimeSpan.FromMinutes(credentialExpires ? 5 : 10));
        }
        finally
        {
            barrier.Release.Set();
        }
        var response = await pending;

        // Then expired setup cannot replace credentials or clear the mandatory restriction.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(
            hash,
            await context.ScalarAsync<string>(
                "SELECT password_hash FROM accounts WHERE id = @Id",
                new { account.Id }
            )
        );
        Assert.True(
            await context.ScalarAsync<bool>(
                "SELECT must_change_password FROM accounts WHERE id = @Id",
                new { account.Id }
            )
        );
    }
}
