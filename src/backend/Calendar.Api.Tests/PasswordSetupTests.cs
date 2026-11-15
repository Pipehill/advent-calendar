using System.Net;
using System.Net.Http.Json;
using Calendar.Api.Generated;
using Calendar.Security;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class PasswordSetupTests(ApiFixture fixture)
{
    private const string Path = "/auth/complete-password-setup";

    [Theory(
        DisplayName = "Given a restricted administrator session, When only a different new password is submitted, Then setup clears temporary state and revokes all sessions"
    )]
    [InlineData(AccountRoles.Administrator)]
    [InlineData(AccountRoles.Superadmin)]
    public async Task RestrictedSessionCompletesSetupWithoutCurrentPassword(string role)
    {
        // Given an administrator with two restricted sessions and known credential state.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionTemporaryAsync(role);
        await context.LoginAsync(account);
        using var other = await context.CreateAuthenticatedClientAsync(account);
        var version = await context.ScalarAsync<Guid>(
            "SELECT security_version FROM accounts WHERE id = @Id",
            new { account.Id }
        );
        var replacement = Password();

        // When the restricted session submits just the replacement password.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            Path,
            new { newPassword = replacement }
        );
        var replay = await other.GetAsync("/auth/session");
        var fresh = await context.LoginAsync(account with { Password = replacement });

        // Then replacement rotates credentials and requires a fresh unrestricted login.
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Contains(
            response.Headers.GetValues("Set-Cookie"),
            cookie => cookie.StartsWith("advent.auth=", StringComparison.Ordinal)
        );
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        Assert.False(fresh.MustChangePassword);
        Assert.NotEqual(
            version,
            await context.ScalarAsync<Guid>(
                "SELECT security_version FROM accounts WHERE id = @Id",
                new { account.Id }
            )
        );
        Assert.True(
            await context.ScalarAsync<bool>(
                "SELECT NOT must_change_password AND temporary_password_expires_at IS NULL FROM accounts WHERE id = @Id",
                new { account.Id }
            )
        );
        Assert.Equal(
            2,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM account_sessions WHERE account_id = @Id AND revoked",
                new { account.Id }
            )
        );
        var hash = await context.ScalarAsync<string>(
            "SELECT password_hash FROM accounts WHERE id = @Id",
            new { account.Id }
        );
        Assert.Equal(
            Microsoft.AspNetCore.Identity.PasswordVerificationResult.Success,
            new ArgonPasswordHasher().VerifyHashedPassword(new Account(), hash, replacement)
        );
        Assert.Equal(
            Microsoft.AspNetCore.Identity.PasswordVerificationResult.Failed,
            new ArgonPasswordHasher().VerifyHashedPassword(new Account(), hash, account.Password)
        );
    }

    [Theory(
        DisplayName = "Given required setup, When the proposal is missing, null, unknown, weak, too long or unchanged, Then rejection preserves credentials, deadlines and failed-attempt counts"
    )]
    [InlineData("missing", "newPassword", HttpStatusCode.BadRequest)]
    [InlineData("null", "newPassword", HttpStatusCode.BadRequest)]
    [InlineData("unknown", "currentPassword", HttpStatusCode.BadRequest)]
    [InlineData("weak", "newPassword", HttpStatusCode.BadRequest)]
    [InlineData("long", "newPassword", HttpStatusCode.BadRequest)]
    [InlineData("same", "newPassword", HttpStatusCode.Conflict)]
    public async Task InvalidProposalPreservesSecurityState(
        string proposal,
        string field,
        HttpStatusCode status
    )
    {
        // Given a restricted session and a prior failed verification that setup must preserve.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionTemporaryAsync();
        var session = await context.LoginAsync(account);
        await context.ExecuteAsync(
            "INSERT INTO password_failures (account_id, occurred_at) VALUES (@Id, @Now)",
            new { account.Id, Now = context.Time.GetUtcNow() }
        );
        var original = await context.ScalarAsync<string>(
            "SELECT password_hash || security_version::text || temporary_password_expires_at::text FROM accounts WHERE id = @Id",
            new { account.Id }
        );
        object body = proposal switch
        {
            "missing" => new { },
            "null" => new { newPassword = (string?)null },
            "unknown" => new { newPassword = Password(), currentPassword = account.Password },
            "weak" => new { newPassword = "Short!a" },
            "long" => new { newPassword = "Aa!" + new string('x', 126) },
            _ => new { newPassword = account.Password },
        };

        // When a noncompliant or unchanged replacement is proposed.
        var response = await SendAsync(context.Client, HttpMethod.Post, Path, body);
        var problem = await response.Content.ReadFromJsonAsync<ApiProblemDetails>();
        var stillRestricted = await context.Client.GetFromJsonAsync<SessionDto>("/auth/session");

        // Then field-specific rejection grants no new privileges and changes no deadlines or failures.
        Assert.Equal(status, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.True(problem!.Errors.ContainsKey(field));
        Assert.True(stillRestricted!.MustChangePassword);
        Assert.Equal(session.ExpiresAt, stillRestricted.ExpiresAt);
        Assert.Equal(
            original,
            await context.ScalarAsync<string>(
                "SELECT password_hash || security_version::text || temporary_password_expires_at::text FROM accounts WHERE id = @Id",
                new { account.Id }
            )
        );
        Assert.Equal(
            1,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM password_failures WHERE account_id = @Id",
                new { account.Id }
            )
        );
    }

    [Theory(
        DisplayName = "Given an ineligible persisted session or account, When required setup is requested, Then credentials remain unchanged"
    )]
    [InlineData("anonymous", HttpStatusCode.Unauthorized)]
    [InlineData("unrestricted", HttpStatusCode.Forbidden)]
    [InlineData("session-expired", HttpStatusCode.Unauthorized)]
    [InlineData("credential-expired", HttpStatusCode.Unauthorized)]
    [InlineData("revoked", HttpStatusCode.Unauthorized)]
    [InlineData("disabled", HttpStatusCode.Unauthorized)]
    [InlineData("paused", HttpStatusCode.Forbidden)]
    [InlineData("stale-version", HttpStatusCode.Unauthorized)]
    [InlineData("no-longer-mandatory", HttpStatusCode.Forbidden)]
    public async Task IneligibleSessionCannotCompleteSetup(string state, HttpStatusCode status)
    {
        // Given live database state that cannot authorize required setup.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionTemporaryAsync();
        if (state != "anonymous")
            await context.LoginAsync(account);
        var sql = state switch
        {
            "unrestricted" =>
                "UPDATE accounts SET must_change_password = false, temporary_password_expires_at = NULL WHERE id = @Id; UPDATE account_sessions SET is_restricted = false WHERE account_id = @Id",
            "credential-expired" =>
                "UPDATE accounts SET temporary_password_expires_at = @Now WHERE id = @Id",
            "revoked" => "UPDATE account_sessions SET revoked = true WHERE account_id = @Id",
            "disabled" => "UPDATE accounts SET enabled = false WHERE id = @Id",
            "paused" => "UPDATE accounts SET locked_until = @PausedUntil WHERE id = @Id",
            "stale-version" => "UPDATE accounts SET security_version = @Version WHERE id = @Id",
            "no-longer-mandatory" =>
                "UPDATE accounts SET must_change_password = false, temporary_password_expires_at = NULL WHERE id = @Id",
            _ => "SELECT 1",
        };
        await context.ExecuteAsync(
            sql,
            new
            {
                account.Id,
                Now = context.Time.GetUtcNow(),
                PausedUntil = context.Time.GetUtcNow().AddMinutes(15),
                Version = Guid.NewGuid(),
            }
        );
        if (state == "session-expired")
            context.Time.Advance(TimeSpan.FromMinutes(10));
        var hash = await context.ScalarAsync<string>(
            "SELECT password_hash FROM accounts WHERE id = @Id",
            new { account.Id }
        );

        // When the caller attempts the restricted-session operation.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            Path,
            new { newPassword = Password() }
        );

        // Then only persisted eligibility grants setup authority.
        Assert.Equal(status, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(
            hash,
            await context.ScalarAsync<string>(
                "SELECT password_hash FROM accounts WHERE id = @Id",
                new { account.Id }
            )
        );
    }

    [Theory(
        DisplayName = "Given a restricted session, When the CSRF token is absent or incorrect, Then password setup is rejected"
    )]
    [InlineData(false)]
    [InlineData(true)]
    public async Task PasswordSetupRequiresCsrf(bool wrongToken)
    {
        // Given an authenticated restricted session without a valid request token.
        await using var context = await CreateAsync(fixture);
        await context.LoginAsync(await context.ProvisionTemporaryAsync());
        if (wrongToken)
            context.Client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", "incorrect");

        // When setup is attempted without a valid principal-bound token.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            Path,
            new { newPassword = Password() },
            csrf: false
        );

        // Then antiforgery rejects the write and preserves no-store.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
    }
}
