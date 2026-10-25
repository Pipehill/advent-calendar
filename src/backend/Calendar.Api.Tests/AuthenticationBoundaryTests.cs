using System.Net;
using System.Net.Http.Json;
using System.Text;
using Calendar.Api.Generated;
using Calendar.Api.Services;
using Calendar.Security;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class AuthenticationBoundaryTests(ApiFixture fixture)
{
    [Theory(
        DisplayName = "Given malformed authentication JSON, When login is submitted, Then validation fails safely with a no-store problem"
    )]
    [InlineData("{}")]
    [InlineData("null")]
    [InlineData("{")]
    [InlineData("{\"username\":\"any\",\"password\":null}")]
    [InlineData("{\"username\":\"any\",\"password\":1}")]
    [InlineData("{\"username\":\"any\",\"password\":\"\\ud800\"}")]
    [InlineData("{\"username\":\"any\",\"password\":\"unused\",\"role\":\"superadmin\"}")]
    public async Task MalformedAuthenticationInputFailsValidation(string json)
    {
        // Given a principal-bound token and malformed or field-injecting JSON.
        await using var context = await CreateAsync(fixture);
        var token = (await context.Client.GetFromJsonAsync<CsrfDto>("/auth/csrf"))!;
        using var request = new HttpRequestMessage(HttpMethod.Post, "/auth/login");
        request.Headers.Add(token.HeaderName, token.RequestToken);
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        // When MVC and authored-contract validation handle the input.
        var response = await context.Client.SendAsync(request);

        // Then input errors never become server errors or persist a session.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(0, await context.CountSessionsAsync());
    }

    [Fact(
        DisplayName = "Given an unexpected password-provider failure, When login runs, Then the server error remains no-store without returning credential material"
    )]
    public async Task UnexpectedAuthenticationErrorsRemainProtected()
    {
        // Given a deliberately failing verification provider in an isolated test host.
        await using var context = await CreateAsync(
            fixture,
            configureServices: services =>
                services.AddSingleton<IPasswordVerification, FailingVerification>()
        );
        var account = await context.ProvisionAsync();

        // When password verification raises an unexpected provider error.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, account.Password }
        );

        // Then generic server errors retain cache protection and exclude supplied secrets.
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.DoesNotContain(
            account.Password,
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal
        );
    }

    private sealed class FailingVerification : IPasswordVerification
    {
        public Task<PasswordVerificationResult> VerifyAsync(Account account, string password) =>
            throw new InvalidOperationException("Isolated verification-provider failure.");
    }

    [Theory(
        DisplayName = "Given a non-superadmin actor, When status or role administration is attempted, Then the target remains unchanged"
    )]
    [InlineData(AccountRoles.User, "status")]
    [InlineData(AccountRoles.User, "role")]
    [InlineData(AccountRoles.Administrator, "status")]
    [InlineData(AccountRoles.Administrator, "role")]
    public async Task OnlySuperadminChangesStatusOrRoles(string actorRole, string operation)
    {
        // Given a nonsuperadmin actor and an ordinary target.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var target = await context.ProvisionAsync(AccountRoles.User, owner.Id);
        var actor = await context.ProvisionAsync(
            actorRole,
            actorRole == AccountRoles.User ? owner.Id : null
        );
        await context.LoginAsync(actor);
        object body =
            operation == "status"
                ? new { enabled = false }
                : new { role = AccountRoles.Administrator, temporaryPassword = Password() };

        // When the actor directly attempts privileged target maintenance.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Patch,
            $"/users/{target.Id}/{operation}",
            body
        );

        // Then role membership alone cannot grant superadmin maintenance authority.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.False(
            (await response.Content.ReadFromJsonAsync<ApiProblemDetails>())!.VerificationRequired
        );
        Assert.True(
            await context.ScalarAsync<bool>(
                "SELECT enabled AND account_role = 'calendarUser' FROM accounts WHERE id = @Id",
                new { target.Id }
            )
        );
    }

    [Theory(
        DisplayName = "Given a reserved username, When creation repeats after disable, Then neither credentials nor role can be replaced"
    )]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DisabledAccountsKeepUsernameReservation(bool disabled)
    {
        // Given a reserved administrator identity, possibly disabled.
        await using var context = await CreateAsync(fixture);
        var target = await context.ProvisionAsync(
            AccountRoles.Administrator,
            username: "ReservedÆØÅ"
        );
        if (disabled)
            await context.ExecuteAsync(
                "UPDATE accounts SET enabled = false WHERE id = @Id",
                new { target.Id }
            );
        var version = await context.ScalarAsync<Guid>(
            "SELECT security_version FROM accounts WHERE id = @Id",
            new { target.Id }
        );
        await context.LoginAsync(await context.ProvisionAsync());

        // When creation attempts to reserve the same case-insensitive username again.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/users",
            new
            {
                username = "reservedæøå",
                name = "Test account",
                password = Password(),
                role = AccountRoles.Administrator,
            }
        );

        // Then creation conflicts without changing the prior account's credential version.
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(
            version,
            await context.ScalarAsync<Guid>(
                "SELECT security_version FROM accounts WHERE id = @Id",
                new { target.Id }
            )
        );
    }

    [Fact(
        DisplayName = "Given a revoked cookie retained by a caller, When it is replayed after logout, Then persistent session validity rejects it"
    )]
    public async Task LogoutRejectsExplicitCookieReplay()
    {
        // Given a copied authentication cookie before logout clears the client's copy.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionAsync();
        var login = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, account.Password }
        );
        var cookie = login
            .Headers.GetValues("Set-Cookie")
            .Single(value => value.StartsWith("advent.auth=", StringComparison.Ordinal))
            .Split(';')[0];
        await SendAsync(context.Client, HttpMethod.Post, "/auth/logout");
        using var replay = context.Application.CreateClient(new() { HandleCookies = false });
        replay.DefaultRequestHeaders.Add("Cookie", cookie);

        // When an independent caller replays the copied cookie.
        var response = await replay.GetAsync("/auth/session");

        // Then cookie replay does not restore the revoked persistent session.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
    }

    [Fact(
        DisplayName = "Given revoked session persistence access, When a valid cookie is inspected, Then authentication fails closed with no-store"
    )]
    public async Task ValidityStoreFailureIsNotAnAuthenticationBypass()
    {
        // Given a valid cookie and an isolated validity table made unavailable.
        await using var context = await CreateAsync(fixture);
        await context.LoginAsync(await context.ProvisionAsync());
        await context.ExecuteAsync("ALTER TABLE account_sessions RENAME TO unavailable_sessions");

        // When the valid cookie would otherwise authorize account inspection.
        var response = await context.Client.GetAsync("/auth/session");

        // Then unavailable persistence never yields authenticated data or cacheable errors.
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact(
        DisplayName = "Given two administrator sessions, When one re-verifies, Then the other cannot reuse its recent-verification window"
    )]
    public async Task RecentVerificationIsSessionBound()
    {
        // Given two sessions older than five minutes for one administrator.
        await using var context = await CreateAsync(fixture);
        var actor = await context.ProvisionAsync();
        await context.LoginAsync(actor);
        using var second = await context.CreateAuthenticatedClientAsync(actor);
        context.Time.Advance(TimeSpan.FromMinutes(5));
        await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/reauthenticate",
            new { password = actor.Password }
        );

        // When the other session attempts a sensitive operation.
        var response = await SendAsync(
            second,
            HttpMethod.Post,
            "/users",
            new
            {
                username = "different-session",
                name = "Test account",
                password = Password(),
                role = AccountRoles.Administrator,
            }
        );

        // Then recent verification is not an account-wide privilege grant.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact(
        DisplayName = "Given five wrong current-password checks, When the correct password is retried, Then the persisted account pause applies"
    )]
    public async Task CurrentPasswordChecksSharePersistedGuessingControls()
    {
        // Given an authenticated administrator and repeated incorrect current-password checks.
        await using var context = await CreateAsync(fixture);
        var actor = await context.ProvisionAsync();
        await context.LoginAsync(actor);
        for (var index = 0; index < 5; index++)
            await SendAsync(
                context.Client,
                HttpMethod.Post,
                "/auth/reauthenticate",
                new { password = Password() }
            );

        // When the correct current password is retried during the account pause.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/reauthenticate",
            new { password = actor.Password }
        );

        // Then an authenticated session cannot bypass guessing controls.
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.True(
            await context.ScalarAsync<bool>(
                "SELECT locked_until IS NOT NULL FROM accounts WHERE id = @Id",
                new { actor.Id }
            )
        );
    }

    [Fact(
        DisplayName = "Given production authentication without external key configuration, When startup runs, Then no ephemeral key fallback is allowed"
    )]
    public async Task ProductionRequiresExternalProtectedKeys()
    {
        // Given a production host whose key directory and certificate are deliberately absent.
        await using var app = fixture
            .Application("Production")
            .WithWebHostBuilder(builder =>
                builder.ConfigureAppConfiguration(
                    (_, configuration) =>
                        configuration.AddInMemoryCollection(
                            new Dictionary<string, string?>
                            {
                                ["Authentication:KeyDirectory"] = null,
                                ["Authentication:KeyCertificatePath"] = null,
                            }
                        )
                )
            );

        // When production startup attempts to resolve its Data Protection provider.
        var startup = () => Task.Run(() => app.CreateClient());

        // Then startup rejects the missing durable encrypted key setup.
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(startup);
        Assert.Contains(
            "Production authentication requires",
            exception.Message,
            StringComparison.Ordinal
        );
    }

    [Fact(
        DisplayName = "Given production transport and external protected keys, When cookies are issued, Then they are Secure and plain HTTP account requests fail"
    )]
    public async Task ProductionCookiesRequireSecureTransport()
    {
        // Given production configuration using a dedicated durable key directory and test certificate.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionAsync();
        await using var app = fixture.Application(
            "Production",
            connectionString: context.ConnectionString,
            time: context.Time
        );
        using var secure = app.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        using var plain = app.CreateClient();

        // When the framework issues a CSRF cookie over HTTPS and HTTP is attempted separately.
        var token = await secure.GetAsync("/auth/csrf");
        var login = await SendAsync(
            secure,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, account.Password }
        );
        var rejected = await plain.GetAsync("/auth/csrf");
        var cookies = token.Headers.GetValues("Set-Cookie").ToArray();

        // Then production cookies are host-only, protected and never issued over plain HTTP.
        Assert.Equal(HttpStatusCode.OK, token.StatusCode);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Contains(
            login.Headers.GetValues("Set-Cookie"),
            cookie =>
                cookie.StartsWith("advent.auth=", StringComparison.Ordinal)
                && cookie.Contains("secure", StringComparison.OrdinalIgnoreCase)
        );
        Assert.Contains(
            cookies,
            cookie =>
                cookie.Contains("secure", StringComparison.OrdinalIgnoreCase)
                && cookie.Contains("httponly", StringComparison.OrdinalIgnoreCase)
        );
        Assert.DoesNotContain(
            cookies,
            cookie => cookie.Contains("domain=", StringComparison.OrdinalIgnoreCase)
        );
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.True(rejected.Headers.CacheControl?.NoStore);
        Assert.All(
            Directory.GetFiles(Path.Combine(fixture.KeyDirectory, "production"), "key-*.xml"),
            file =>
                Assert.Contains("encryptedSecret", File.ReadAllText(file), StringComparison.Ordinal)
        );
    }
}
