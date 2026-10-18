using System.Net;
using System.Net.Http.Json;
using Calendar.Api.Generated;
using Calendar.Security;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class AuthenticationLifecycleTests(ApiFixture fixture)
{
    [Fact(
        DisplayName = "Given administrator verification exactly five minutes old, When a sensitive mutation is attempted, Then re-verification is required without extending the session"
    )]
    public async Task RecentVerificationExpiresAtFiveMinutes()
    {
        // Given a valid administrator session and its original expiry.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionAsync();
        var original = await context.LoginAsync(account);
        context.Time.Advance(TimeSpan.FromMinutes(5));

        // When creation is attempted at the boundary, followed by current-password re-verification.
        var stale = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/users",
            new
            {
                username = "fresh-admin",
                password = Password(),
                role = AccountRoles.Administrator,
            }
        );
        var refresh = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/reauthenticate",
            new { password = account.Password }
        );
        var allowed = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/users",
            new
            {
                username = "fresh-admin",
                password = Password(),
                role = AccountRoles.Administrator,
            }
        );
        var session = (await context.Client.GetFromJsonAsync<SessionDto>("/auth/session"))!;

        // Then fresh session-bound verification permits creation while expiry remains fixed.
        Assert.Equal(HttpStatusCode.Forbidden, stale.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, refresh.StatusCode);
        Assert.Equal(HttpStatusCode.Created, allowed.StatusCode);
        Assert.Equal(original.ExpiresAt, session.ExpiresAt);
    }

    [Fact(
        DisplayName = "Given an expiring temporary credential, When login occurs late, Then the restricted session cannot outlive its original deadline"
    )]
    public async Task TemporaryCredentialCapsLateLoginAndNeverRenews()
    {
        // Given an API-created ordinary account and the persisted initial deadline.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        await context.LoginAsync(owner);
        var temporary = Password();
        var createdResponse = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/users",
            new
            {
                username = "late-recipient",
                password = temporary,
                role = AccountRoles.User,
            }
        );
        var account = (await createdResponse.Content.ReadFromJsonAsync<UserDto>())!;
        var deadline = context.Time.GetUtcNow().AddMinutes(30);
        context.Time.Advance(TimeSpan.FromMinutes(29));
        using var recipient = context.Application.CreateClient();

        // When the temporary password is used just before expiry and then at the deadline.
        var session = await context.LoginAsync(
            new(account.Id, account.Username, temporary, AccountRoles.User),
            recipient
        );
        await recipient.GetAsync("/auth/csrf");
        context.Time.Advance(TimeSpan.FromMinutes(1));
        var expired = await recipient.GetAsync("/auth/session");
        var lateLogin = await SendAsync(
            recipient,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, password = temporary }
        );
        var lateChange = await SendAsync(
            recipient,
            HttpMethod.Post,
            "/auth/change-password",
            new { currentPassword = temporary, newPassword = Password() }
        );

        // Then neither login nor CSRF refresh extends the original credential or session deadline.
        Assert.Equal(deadline, session.ExpiresAt);
        Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, lateLogin.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, lateChange.StatusCode);
        Assert.True(
            await context.ScalarAsync<bool>(
                "SELECT must_change_password AND temporary_password_expires_at = @Deadline FROM accounts WHERE id = @Id",
                new { account.Id, Deadline = deadline }
            )
        );
    }

    [Fact(
        DisplayName = "Given an expired initial password, When an authorized reset issues a new password, Then only a fresh restricted setup window is restored"
    )]
    public async Task ResetRestoresOnlyRestrictedSetup()
    {
        // Given an expired initial ordinary account retaining its ID and responsible administrator.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        await context.LoginAsync(owner);
        var initial = Password();
        var createdResponse = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/users",
            new
            {
                username = "expired-recipient",
                password = initial,
                role = AccountRoles.User,
            }
        );
        var account = (await createdResponse.Content.ReadFromJsonAsync<UserDto>())!;
        context.Time.Advance(TimeSpan.FromMinutes(30));
        await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/reauthenticate",
            new { password = owner.Password }
        );

        // When its responsible administrator issues a different temporary password.
        var replacement = Password();
        var reset = await SendAsync(
            context.Client,
            HttpMethod.Post,
            $"/users/{account.Id}/reset-password",
            new { password = replacement }
        );
        using var recipient = context.Application.CreateClient();
        var old = await SendAsync(
            recipient,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, password = initial }
        );
        var current = await context.LoginAsync(
            new(account.Id, account.Username, replacement, AccountRoles.User),
            recipient
        );
        context.Time.Advance(TimeSpan.FromMinutes(10));
        var expiredSession = await recipient.GetAsync("/auth/session");

        // Then the identity remains fixed and the replacement grants at most ten minutes of restricted access.
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, old.StatusCode);
        Assert.True(current.MustChangePassword);
        Assert.Equal(owner.Id, current.User.ResponsibleAdministratorId);
        Assert.Equal(HttpStatusCode.Unauthorized, expiredSession.StatusCode);
    }

    [Fact(
        DisplayName = "Given two successive resets, When old passwords and restricted sessions are reused, Then only the latest credential remains valid"
    )]
    public async Task NewerResetSupersedesEveryPreviousCredential()
    {
        // Given an ordinary account and a restricted session from the first reset.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var account = await context.ProvisionAsync(AccountRoles.User, owner.Id);
        await context.LoginAsync(owner);
        var first = Password();
        await SendAsync(
            context.Client,
            HttpMethod.Post,
            $"/users/{account.Id}/reset-password",
            new { password = first }
        );
        using var recipient = context.Application.CreateClient();
        await context.LoginAsync(account with { Password = first }, recipient);

        // When a second reset replaces that credential and earlier state is replayed.
        var second = Password();
        var reset = await SendAsync(
            context.Client,
            HttpMethod.Post,
            $"/users/{account.Id}/reset-password",
            new { password = second }
        );
        var replay = await recipient.GetAsync("/auth/session");
        var superseded = await SendAsync(
            recipient,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, password = first }
        );
        var fresh = await context.LoginAsync(account with { Password = second }, recipient);

        // Then the prior reset/session is invalid and the latest login is still restricted.
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, superseded.StatusCode);
        Assert.True(fresh.MustChangePassword);
    }

    [Fact(
        DisplayName = "Given a promoted and demoted account, When role toggling attempts reassignment, Then its original responsible administrator is retained"
    )]
    public async Task RoleTogglingCannotReassignAccount()
    {
        // Given an ordinary account with its immutable original administrator.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var alternate = await context.ProvisionAsync(AccountRoles.Administrator);
        var target = await context.ProvisionAsync(AccountRoles.User, owner.Id);
        await context.LoginAsync(await context.ProvisionAsync());
        await SendAsync(
            context.Client,
            HttpMethod.Patch,
            $"/users/{target.Id}/role",
            new { role = AccountRoles.Administrator, temporaryPassword = Password() }
        );

        // When demotion attempts a new association, then returns using the original association.
        var reassignment = await SendAsync(
            context.Client,
            HttpMethod.Patch,
            $"/users/{target.Id}/role",
            new { role = AccountRoles.User, responsibleAdministratorId = alternate.Id }
        );
        var returnToUser = await SendAsync(
            context.Client,
            HttpMethod.Patch,
            $"/users/{target.Id}/role",
            new { role = AccountRoles.User }
        );

        // Then toggling cannot transfer responsibility and valid demotion preserves history.
        Assert.Equal(HttpStatusCode.Conflict, reassignment.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, returnToUser.StatusCode);
        Assert.Equal(
            owner.Id,
            await context.ScalarAsync<Guid>(
                "SELECT responsible_administrator_id FROM accounts WHERE id = @Id",
                new { target.Id }
            )
        );
    }

    [Fact(
        DisplayName = "Given an ordinary fixed-lifetime session, When activity and thirty days elapse, Then expiry is never extended"
    )]
    public async Task OrdinarySessionExpiresAtThirtyDays()
    {
        // Given an ordinary account with an unrestricted persistent session.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var account = await context.ProvisionAsync(AccountRoles.User, owner.Id);
        var original = await context.LoginAsync(account);
        context.Time.Advance(TimeSpan.FromDays(29));

        // When authenticated activity occurs before the original thirty-day boundary.
        var active = (await context.Client.GetFromJsonAsync<SessionDto>("/auth/session"))!;
        context.Time.Advance(TimeSpan.FromDays(1));
        var expired = await context.Client.GetAsync("/auth/session");

        // Then activity preserves the original expiry and the exact boundary rejects the session.
        Assert.Equal(original.ExpiresAt, active.ExpiresAt);
        Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);
    }

    [Fact(
        DisplayName = "Given repeated invalid logins from one peer, When forwarded addresses vary, Then peer resource limits still reject excess work"
    )]
    public async Task SpoofedProxyHeadersCannotBypassHashBudget()
    {
        // Given one actual peer with changing untrusted forwarding headers.
        await using var context = await CreateAsync(fixture);
        HttpResponseMessage? last = null;

        // When more than thirty unsafe authentication requests arrive in one minute.
        for (var index = 0; index < 31; index++)
        {
            context.Client.DefaultRequestHeaders.Remove("X-Forwarded-For");
            context.Client.DefaultRequestHeaders.Add("X-Forwarded-For", $"192.0.2.{index}");
            last = await SendAsync(
                context.Client,
                HttpMethod.Post,
                "/auth/login",
                new { username = "invalid name", password = Password() }
            );
        }

        // Then spoofed addresses do not manufacture budgets and throttled output remains no-store.
        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
        Assert.True(last.Headers.CacheControl?.NoStore);
        Assert.Equal(
            0,
            await context.ScalarAsync<int>("SELECT count(*)::int FROM account_sessions")
        );
    }
}
