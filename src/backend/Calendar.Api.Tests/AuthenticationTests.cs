using System.Net;
using System.Net.Http.Json;
using System.Text;
using Calendar.Api.Generated;
using Calendar.Security;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class AuthenticationTests(ApiFixture fixture)
{
    [Fact(
        DisplayName = "Given an empty development database with seeding enabled, When startup and restart run, Then no accounts are created"
    )]
    public async Task StartupNeverSeedsAccounts()
    {
        // Given an isolated database and all development seed flags enabled.
        await using var context = await CreateAsync(fixture, seed: true);

        // When the API restarts using the same database and development flags.
        await using var restarted = fixture.Application(
            "Development",
            true,
            context.ConnectionString,
            context.Time
        );
        using var client = restarted.CreateClient();
        var health = await client.GetAsync("/health/ready");

        // Then only the existing calendar seed exists, with zero accounts or sessions.
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        Assert.Equal(0, await context.ScalarAsync<int>("SELECT count(*)::int FROM accounts"));
        Assert.Equal(
            0,
            await context.ScalarAsync<int>("SELECT count(*)::int FROM account_sessions")
        );
        Assert.Equal(1, await context.ScalarAsync<int>("SELECT count(*)::int FROM calendars"));
    }

    [Theory(
        DisplayName = "Given an anonymous direct API caller, When an account operation is attempted, Then no identity headers grant access"
    )]
    [InlineData("GET", "/users")]
    [InlineData("GET", "/auth/session")]
    [InlineData("POST", "/users")]
    [InlineData("POST", "/auth/change-password")]
    [InlineData("POST", "/auth/reauthenticate")]
    [InlineData("POST", "/users/00000000-0000-0000-0000-000000000001/reset-password")]
    [InlineData("PATCH", "/users/00000000-0000-0000-0000-000000000001/status")]
    [InlineData("PATCH", "/users/00000000-0000-0000-0000-000000000001/role")]
    public async Task AnonymousCannotUseAccountOperations(string method, string path)
    {
        // Given an anonymous caller supplying forged identity and role headers.
        await using var context = await CreateAsync(fixture);
        context.Client.DefaultRequestHeaders.Add("X-Role", "superadmin");
        context.Client.DefaultRequestHeaders.Add("X-User-Id", Guid.NewGuid().ToString());

        // When the direct API route is called.
        var response = await SendAsync(context.Client, new HttpMethod(method), path, new { });

        // Then authentication fails without writes, redirects or cacheable output.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Null(response.Headers.Location);
        Assert.Equal(0, await context.ScalarAsync<int>("SELECT count(*)::int FROM accounts"));
    }

    [Theory(
        DisplayName = "Given a state-changing authentication operation, When its antiforgery token is absent, Then the framework rejects it"
    )]
    [InlineData("/auth/login")]
    [InlineData("/auth/logout")]
    public async Task LoginAndLogoutRequireCsrf(string path)
    {
        // Given a direct caller without an antiforgery exchange.
        await using var context = await CreateAsync(fixture);

        // When an unsafe authentication operation is sent without the request token.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            path,
            new { username = "absent", password = Password() },
            csrf: false
        );

        // Then ASP.NET antiforgery rejects the operation and the error remains no-store.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(
            0,
            await context.ScalarAsync<int>("SELECT count(*)::int FROM account_sessions")
        );
    }

    [Fact(
        DisplayName = "Given a manually provisioned superadmin, When login and restart occur, Then the fixed session and protected cookie survive"
    )]
    public async Task ManualSuperadminLoginSurvivesRestart()
    {
        // Given a superadmin inserted manually into an isolated database.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionAsync(username: "JuleÆØÅ");
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/login",
            new { username = "juleæøå", account.Password }
        );
        var session = (await response.Content.ReadFromJsonAsync<SessionDto>())!;
        var cookie = response
            .Headers.GetValues("Set-Cookie")
            .Single(value => value.StartsWith("advent.auth=", StringComparison.Ordinal));
        await using var restarted = fixture.Application(
            connectionString: context.ConnectionString,
            time: context.Time
        );
        using var replay = restarted.CreateClient(new() { HandleCookies = false });
        replay.DefaultRequestHeaders.Add("Cookie", cookie.Split(';')[0]);

        // When the cookie is replayed after restart and at its fixed expiry.
        var valid = await replay.GetAsync("/auth/session");
        context.Time.Advance(TimeSpan.FromHours(8));
        var expired = await replay.GetAsync("/auth/session");

        // Then durable keys/session state preserve validity only within the original lifetime.
        Assert.Equal(HttpStatusCode.OK, valid.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);
        Assert.Equal(account.Id, session.User.Id);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("expires=", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("domain=", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.DoesNotContain(
            account.Password,
            await valid.Content.ReadAsStringAsync(),
            StringComparison.Ordinal
        );
        Assert.DoesNotContain(
            "passwordHash",
            await valid.Content.ReadAsStringAsync(),
            StringComparison.OrdinalIgnoreCase
        );
    }

    [Fact(
        DisplayName = "Given two sessions, When one logs out, Then only that session is revoked including cookie replay"
    )]
    public async Task LogoutRevokesOnlyCurrentSession()
    {
        // Given two separately authenticated clients for the same account.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionAsync();
        await context.LoginAsync(account);
        using var second = context.Application.CreateClient();
        await context.LoginAsync(account, second);

        // When the first logs out and both clients inspect their sessions.
        var logout = await SendAsync(context.Client, HttpMethod.Post, "/auth/logout");
        var first = await context.Client.GetAsync("/auth/session");
        var other = await second.GetAsync("/auth/session");

        // Then logout revokes just the original session.
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, other.StatusCode);
        Assert.Equal(
            1,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM account_sessions WHERE revoked"
            )
        );
    }

    [Fact(
        DisplayName = "Given five failed passwords, When restart and more attempts occur, Then the fixed persisted pause is not extended"
    )]
    public async Task FailedAttemptsPersistAndPauseDoesNotSlide()
    {
        // Given an account and five failed login attempts at controlled time.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionAsync();
        for (var attempt = 0; attempt < 5; attempt++)
            Assert.Equal(
                HttpStatusCode.Unauthorized,
                (
                    await SendAsync(
                        context.Client,
                        HttpMethod.Post,
                        "/auth/login",
                        new { account.Username, password = Password() }
                    )
                ).StatusCode
            );
        var deadline = await context.ScalarAsync<DateTime>(
            "SELECT locked_until FROM accounts WHERE id = @Id",
            new { account.Id }
        );
        context.Time.Advance(TimeSpan.FromMinutes(10));
        await using var restarted = fixture.Application(
            connectionString: context.ConnectionString,
            time: context.Time
        );
        using var client = restarted.CreateClient();

        // When a correct password is attempted during the pause, then at its boundary.
        var paused = await SendAsync(
            client,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, account.Password }
        );
        var unchanged = await context.ScalarAsync<DateTime>(
            "SELECT locked_until FROM accounts WHERE id = @Id",
            new { account.Id }
        );
        context.Time.Advance(TimeSpan.FromMinutes(5));
        var resumed = await SendAsync(
            client,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, account.Password }
        );

        // Then attempts during the pause do not alter its deadline and expiry clears failures.
        Assert.Equal(HttpStatusCode.Unauthorized, paused.StatusCode);
        Assert.Equal(deadline, unchanged);
        Assert.Equal(HttpStatusCode.OK, resumed.StatusCode);
        Assert.Equal(
            0,
            await context.ScalarAsync<int>("SELECT count(*)::int FROM password_failures")
        );
    }

    [Fact(
        DisplayName = "Given failures outside the rolling window, When another failure occurs, Then old failures do not cause a pause"
    )]
    public async Task FailuresUseRollingWindow()
    {
        // Given four failures whose timestamps will leave the observation window.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionAsync();
        for (var attempt = 0; attempt < 4; attempt++)
            await SendAsync(
                context.Client,
                HttpMethod.Post,
                "/auth/login",
                new { account.Username, password = Password() }
            );
        context.Time.Advance(TimeSpan.FromMinutes(15));

        // When a fifth overall failure arrives after the earlier window expires.
        var failure = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, password = Password() }
        );

        // Then only the new failure remains and no pause is set.
        Assert.Equal(HttpStatusCode.Unauthorized, failure.StatusCode);
        Assert.Equal(
            1,
            await context.ScalarAsync<int>("SELECT count(*)::int FROM password_failures")
        );
        Assert.False(
            await context.ScalarAsync<bool>(
                "SELECT locked_until IS NOT NULL FROM accounts WHERE id = @Id",
                new { account.Id }
            )
        );
    }

    [Fact(
        DisplayName = "Given a completed CSRF exchange before login, When the principal changes, Then the old request token is rejected"
    )]
    public async Task CsrfIsBoundToPrincipal()
    {
        // Given an anonymous request token and a subsequent authenticated login.
        await using var context = await CreateAsync(fixture);
        var token = (await context.Client.GetFromJsonAsync<CsrfDto>("/auth/csrf"))!;
        await context.LoginAsync(await context.ProvisionAsync());
        using var request = new HttpRequestMessage(HttpMethod.Post, "/auth/logout");
        request.Headers.Add(token.HeaderName, token.RequestToken);

        // When the anonymous token is reused with the authenticated principal.
        var response = await context.Client.SendAsync(request);

        // Then a new principal-bound token is required.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
    }
}
