using System.Net;
using System.Net.Http.Json;
using Calendar.Api.Authentication;
using Calendar.Api.Generated;
using Calendar.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class AuthenticationConcurrencyTests(ApiFixture fixture)
{
    [Fact(
        DisplayName = "Given two active password verifications, When another login arrives, Then the hash-work bound rejects it without an unbounded queue"
    )]
    public async Task HashConcurrencyIsBoundedBeforeVerification()
    {
        // Given two login requests held after actual password verification.
        var barrier = new VerificationBarrier(expected: 2);
        await using var context = await CreateAsync(
            fixture,
            configureServices: services => services.AddSingleton<IPasswordVerification>(barrier)
        );
        var account = await context.ProvisionAsync();
        using var second = context.Application.CreateClient();
        using var third = context.Application.CreateClient();
        barrier.PauseAccount(account.Id);
        var firstLogin = SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, account.Password }
        );
        var secondLogin = SendAsync(
            second,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, account.Password }
        );
        await barrier.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));

        // When a third request attempts to allocate hash work with no queue capacity.
        HttpResponseMessage rejected;
        try
        {
            rejected = await SendAsync(
                third,
                HttpMethod.Post,
                "/auth/login",
                new { account.Username, account.Password }
            );
        }
        finally
        {
            barrier.Release.TrySetResult();
        }
        var accepted = await Task.WhenAll(firstLogin, secondLogin);

        // Then exactly two verifications run, and throttling has no cacheable response.
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.True(rejected.Headers.CacheControl?.NoStore);
        Assert.All(accepted, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        Assert.Equal(2, barrier.Count);
    }

    [Theory(
        DisplayName = "Given a login paused after password verification, When a credential or privilege mutation commits, Then the stale result cannot create a session"
    )]
    [InlineData("reset", false)]
    [InlineData("disable", false)]
    [InlineData("role", false)]
    [InlineData("password", false)]
    [InlineData("reset", true)]
    public async Task ConcurrentRevocationRejectsVerifiedLogin(string operation, bool legacyHash)
    {
        // Given an independent target login paused after real Argon2id verification.
        var barrier = new VerificationBarrier();
        await using var context = await CreateAsync(
            fixture,
            configureServices: services => services.AddSingleton<IPasswordVerification>(barrier)
        );
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var target = await context.ProvisionAsync(AccountRoles.User, owner.Id);
        if (legacyHash)
            await context.ExecuteAsync(
                "UPDATE accounts SET password_hash = @Hash WHERE id = @Id",
                new { target.Id, Hash = LegacyHash(target.Password) }
            );
        await context.LoginAsync(await context.ProvisionAsync());
        using var recipient = context.Application.CreateClient();
        using var accountHolder = context.Application.CreateClient();
        if (operation == "password")
            await context.LoginAsync(target, accountHolder);
        barrier.PauseAccount(target.Id);
        var pending = SendAsync(
            recipient,
            HttpMethod.Post,
            "/auth/login",
            new { target.Username, target.Password }
        );
        await barrier.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));

        // When an authorized credential/privilege mutation commits before login resumes.
        HttpResponseMessage mutation;
        try
        {
            mutation = operation switch
            {
                "disable" => await SendAsync(
                    context.Client,
                    HttpMethod.Patch,
                    $"/users/{target.Id}/status",
                    new { enabled = false }
                ),
                "role" => await SendAsync(
                    context.Client,
                    HttpMethod.Patch,
                    $"/users/{target.Id}/role",
                    new { role = AccountRoles.Administrator, temporaryPassword = Password() }
                ),
                "password" => await SendAsync(
                    accountHolder,
                    HttpMethod.Post,
                    "/auth/change-password",
                    new { currentPassword = target.Password, newPassword = Password() }
                ),
                _ => await SendAsync(
                    context.Client,
                    HttpMethod.Post,
                    $"/users/{target.Id}/reset-password",
                    new { password = Password() }
                ),
            };
        }
        finally
        {
            barrier.Release.TrySetResult();
        }
        var stale = await pending;

        // Then only current account state is accepted and stale verification creates no session.
        Assert.Equal(HttpStatusCode.NoContent, mutation.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, stale.StatusCode);
        Assert.Equal(
            0,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM account_sessions WHERE account_id = @Id AND NOT revoked",
                new { target.Id }
            )
        );
    }

    [Fact(
        DisplayName = "Given an administrator reset paused after hashing, When the acting administrator is disabled, Then no stale target mutation commits"
    )]
    public async Task ActorRevocationDuringTargetMutationIsRechecked()
    {
        // Given an authorized reset paused outside the final database transaction.
        using var barrier = new HashBarrier();
        await using var context = await CreateAsync(
            fixture,
            configureServices: services => services.AddSingleton<IPasswordHasher<Account>>(barrier)
        );
        var actor = await context.ProvisionAsync(AccountRoles.Administrator);
        var target = await context.ProvisionAsync(AccountRoles.User, actor.Id);
        await context.LoginAsync(actor);
        using var superadmin = context.Application.CreateClient();
        await context.LoginAsync(await context.ProvisionAsync(), superadmin);
        var version = await context.ScalarAsync<Guid>(
            "SELECT security_version FROM accounts WHERE id = @Id",
            new { target.Id }
        );
        barrier.PauseAccount(target.Id);
        var pending = Task.Run(() =>
            SendAsync(
                context.Client,
                HttpMethod.Post,
                $"/users/{target.Id}/reset-password",
                new { password = Password() }
            )
        );
        await barrier.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));

        // When superadmin disables the actor before the reset's mutation transaction.
        HttpResponseMessage disable;
        try
        {
            disable = await SendAsync(
                superadmin,
                HttpMethod.Patch,
                $"/users/{actor.Id}/status",
                new { enabled = false }
            );
        }
        finally
        {
            barrier.Release.Set();
        }
        var stale = await pending;

        // Then final actor/session authorization prevents the prepared reset from committing.
        Assert.Equal(HttpStatusCode.NoContent, disable.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, stale.StatusCode);
        Assert.Equal(
            version,
            await context.ScalarAsync<Guid>(
                "SELECT security_version FROM accounts WHERE id = @Id",
                new { target.Id }
            )
        );
    }

    [Fact(
        DisplayName = "Given child creation racing administrator demotion, When both transactions complete, Then no ordinary user depends on a demoted administrator"
    )]
    public async Task CreationAndDemotionPreserveResponsibility()
    {
        // Given an administrator without dependants and a superadmin preparing demotion.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var alternate = await context.ProvisionAsync(AccountRoles.Administrator);
        await context.LoginAsync(owner);
        using var superadmin = context.Application.CreateClient();
        await context.LoginAsync(await context.ProvisionAsync(), superadmin);

        // When child creation and demotion race through independent API requests.
        var outcomes = await Task.WhenAll(
            SendAsync(
                context.Client,
                HttpMethod.Post,
                "/users",
                new
                {
                    username = "concurrent-child",
                    name = "Test account",
                    password = Password(),
                    role = AccountRoles.User,
                }
            ),
            SendAsync(
                superadmin,
                HttpMethod.Patch,
                $"/users/{owner.Id}/role",
                new { role = AccountRoles.User, responsibleAdministratorId = alternate.Id }
            )
        );

        // Then at most one operation succeeds and persisted responsibility remains valid.
        Assert.Single(outcomes, response => response.IsSuccessStatusCode);
        Assert.False(
            await context.ScalarAsync<bool>(
                "SELECT EXISTS (SELECT 1 FROM accounts child JOIN accounts owner ON owner.id = child.responsible_administrator_id WHERE child.account_role = 'calendarUser' AND owner.account_role <> 'calendarAdmin')"
            )
        );
    }

    [Fact(
        DisplayName = "Given an older supported Argon2id hash, When a current password login succeeds, Then hash costs upgrade without changing the password"
    )]
    public async Task SuccessfulLoginUpgradesOlderHash()
    {
        // Given a manually provisioned account using an older, explicitly versioned hash cost.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionAsync();
        await context.ExecuteAsync(
            "UPDATE accounts SET password_hash = @Hash WHERE id = @Id",
            new { account.Id, Hash = LegacyHash(account.Password) }
        );

        // When the correct password is verified and a login commits.
        var session = await context.LoginAsync(account);
        var hash = await context.ScalarAsync<string>(
            "SELECT password_hash FROM accounts WHERE id = @Id",
            new { account.Id }
        );

        // Then the library verifies the same password against upgraded production costs.
        Assert.Equal(account.Id, session.User.Id);
        Assert.StartsWith("$argon2id$v=19$m=65536,t=3,p=1$", hash, StringComparison.Ordinal);
        Assert.Equal(
            PasswordVerificationResult.Success,
            new ArgonPasswordHasher().VerifyHashedPassword(new Account(), hash, account.Password)
        );
    }

    private static string LegacyHash(string password)
    {
        Span<char> hash = stackalloc char[Geralt.Argon2id.HashSize];
        Geralt.Argon2id.ComputeHash(
            hash,
            System.Text.Encoding.UTF8.GetBytes(password),
            2,
            19 * 1024 * 1024
        );
        return hash.ToString().TrimEnd('\0');
    }

    [Fact(
        DisplayName = "Given two simultaneous password changes using one old credential, When both verify, Then at most one change commits"
    )]
    public async Task ConcurrentPasswordChangesHaveOneWinner()
    {
        // Given two sessions and two password changes synchronized after verification.
        var barrier = new VerificationBarrier(expected: 2);
        await using var context = await CreateAsync(
            fixture,
            configureServices: services => services.AddSingleton<IPasswordVerification>(barrier)
        );
        var account = await context.ProvisionAsync();
        await context.LoginAsync(account);
        using var second = context.Application.CreateClient();
        await context.LoginAsync(account, second);
        barrier.PauseAccount(account.Id);
        var firstChange = SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/change-password",
            new { currentPassword = account.Password, newPassword = Password() }
        );
        var secondChange = SendAsync(
            second,
            HttpMethod.Post,
            "/auth/change-password",
            new { currentPassword = account.Password, newPassword = Password() }
        );

        // When both verified requests continue against the persisted security version.
        await barrier.Entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        barrier.Release.TrySetResult();
        var responses = await Task.WhenAll(firstChange, secondChange);

        // Then the old credential cannot overwrite the winning change or preserve sessions.
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.NoContent);
        Assert.Single(
            responses,
            response =>
                response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Conflict
        );
        Assert.Equal(
            0,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM account_sessions WHERE NOT revoked"
            )
        );
    }

    [Fact(
        DisplayName = "Given concurrent creation of one normalized username, When two administrators submit it, Then one reserved account exists"
    )]
    public async Task ConcurrentDuplicateCreationCannotReplaceCredentials()
    {
        // Given two independent authenticated requests targeting the same normalized username.
        await using var context = await CreateAsync(fixture);
        var actor = await context.ProvisionAsync();
        await context.LoginAsync(actor);
        using var second = await context.CreateAuthenticatedClientAsync(actor);

        // When both requests attempt creation concurrently.
        var responses = await Task.WhenAll(
            SendAsync(
                context.Client,
                HttpMethod.Post,
                "/users",
                new
                {
                    username = "SameÆØÅ",
                    name = "Test account",
                    password = Password(),
                    role = AccountRoles.Administrator,
                }
            ),
            SendAsync(
                second,
                HttpMethod.Post,
                "/users",
                new
                {
                    username = "sameæøå",
                    name = "Test account",
                    password = Password(),
                    role = AccountRoles.Administrator,
                }
            )
        );

        // Then one identity is created and the collision returns a conflict.
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Created);
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(
            1,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM accounts WHERE normalized_user_name = @Name",
                new { Name = AccountNames.Normalize("SameÆØÅ") }
            )
        );
    }

    [Fact(
        DisplayName = "Given output caching enabled with a shared base policy, When distinct accounts inspect sessions, Then no cached body or cookie crosses accounts"
    )]
    public async Task SharedOutputCachingCannotReuseAuthentication()
    {
        // Given an enabled shared output cache and independent authenticated clients.
        await using var context = await CreateAsync(
            fixture,
            configureServices: services =>
            {
                services.AddOutputCache(options =>
                    options.AddBasePolicy(policy => policy.Cache().SetVaryByHeader("Accept"))
                );
                services.AddSingleton<IStartupFilter, OutputCacheStartup>();
            }
        );
        var first = await context.ProvisionAsync();
        var second = await context.ProvisionAsync();
        await context.LoginAsync(first);
        using var other = context.Application.CreateClient();
        await context.LoginAsync(second, other);

        // When both clients inspect sessions and one logs out under the shared cache policy.
        var own = await context.Client.GetFromJsonAsync<SessionDto>("/auth/session");
        var separate = await other.GetFromJsonAsync<SessionDto>("/auth/session");
        await SendAsync(context.Client, HttpMethod.Post, "/auth/logout");
        var revoked = await context.Client.GetAsync("/auth/session");
        var csrf = await other.GetAsync("/auth/csrf");

        // Then identities remain isolated and a cached success cannot revive logout.
        Assert.Equal(first.Id, own!.User.Id);
        Assert.Equal(second.Id, separate!.User.Id);
        Assert.Equal(HttpStatusCode.Unauthorized, revoked.StatusCode);
        Assert.True(csrf.Headers.CacheControl?.NoStore);
    }

    private sealed class OutputCacheStartup : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) =>
            app =>
            {
                app.UseRouting();
                app.UseOutputCache();
                next(app);
            };
    }
}

internal sealed class HashBarrier : IPasswordHasher<Account>, IDisposable
{
    private readonly ArgonPasswordHasher inner = new();
    private Guid pausedAccount;
    public TaskCompletionSource Entered { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
    public ManualResetEventSlim Release { get; } = new();

    public void PauseAccount(Guid id) => pausedAccount = id;

    public string HashPassword(Account user, string password)
    {
        var hash = inner.HashPassword(user, password);
        if (user.Id == pausedAccount)
        {
            Entered.TrySetResult();
            if (!Release.Wait(TimeSpan.FromSeconds(15)))
                throw new TimeoutException("Test mutation barrier timed out.");
        }
        return hash;
    }

    public PasswordVerificationResult VerifyHashedPassword(
        Account user,
        string hash,
        string password
    ) => inner.VerifyHashedPassword(user, hash, password);

    public void Dispose() => Release.Dispose();
}

internal sealed class VerificationBarrier(int expected = 1) : IPasswordVerification
{
    private Guid pausedAccount;
    private int count;
    public int Count => Volatile.Read(ref count);
    public TaskCompletionSource Entered { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
    public TaskCompletionSource Release { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    public void PauseAccount(Guid id) => pausedAccount = id;

    public async Task<PasswordVerificationResult> VerifyAsync(Account account, string password)
    {
        var result = new ArgonPasswordHasher().VerifyHashedPassword(
            account,
            account.PasswordHash,
            password
        );
        if (account.Id == pausedAccount && result != PasswordVerificationResult.Failed)
        {
            var ordinal = Interlocked.Increment(ref count);
            if (ordinal == expected)
                Entered.TrySetResult();
            if (ordinal <= expected)
                await Release.Task.WaitAsync(TimeSpan.FromSeconds(15));
        }
        return result;
    }
}
