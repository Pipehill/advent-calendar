using System.Net;
using System.Net.Http.Json;
using Calendar.Api.Generated;
using Calendar.Security;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class CalendarUserPasswordTests(ApiFixture fixture)
{
    [Theory(
        DisplayName = "Given either authorized administrator, When a calendar user is created or reset, Then its password remains permanent and sessions last thirty days"
    )]
    [InlineData(AccountRoles.Administrator, false)]
    [InlineData(AccountRoles.Superadmin, false)]
    [InlineData(AccountRoles.Administrator, true)]
    [InlineData(AccountRoles.Superadmin, true)]
    public async Task SuppliedUserPasswordIsPermanent(string actorRole, bool reset)
    {
        // Given an authorized actor and an ordinary account, with two sessions for reset cases.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var actor =
            actorRole == AccountRoles.Administrator ? owner : await context.ProvisionAsync();
        await context.LoginAsync(actor);
        var password = Password();
        TestAccount account;
        using var recipient = context.Application.CreateClient();
        using var second = context.Application.CreateClient();
        if (reset)
        {
            account = await context.ProvisionAsync(AccountRoles.User, owner.Id);
            await context.LoginAsync(account, recipient);
            await context.LoginAsync(account, second);
        }
        else
            account = new(Guid.Empty, "permanent-recipient", password, AccountRoles.User);
        var creation = new Dictionary<string, object>
        {
            ["username"] = account.Username,
            ["name"] = "Calendar recipient",
            ["password"] = password,
            ["role"] = AccountRoles.User,
        };
        if (actorRole == AccountRoles.Superadmin)
            creation["responsibleAdministratorId"] = owner.Id;

        // When the administrator supplies the password and the user logs in over several days.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            reset ? $"/users/{account.Id}/reset-password" : "/users",
            reset ? new { password } : creation
        );
        if (!reset)
            account = account with
            {
                Id = (await response.Content.ReadFromJsonAsync<UserDto>())!.Id,
            };
        var oldSession = await recipient.GetAsync("/auth/session");
        var otherSession = await second.GetAsync("/auth/session");
        var oldLogin = reset
            ? await SendAsync(
                recipient,
                HttpMethod.Post,
                "/auth/login",
                new { account.Username, account.Password }
            )
            : null;
        var actorSession = await context.Client.GetFromJsonAsync<SessionDto>("/auth/session");
        var sessions = new List<(DateTimeOffset At, SessionDto Session)>();
        foreach (
            var elapsed in new[] { TimeSpan.Zero, TimeSpan.FromMinutes(31), TimeSpan.FromDays(3) }
        )
        {
            context.Time.Advance(elapsed);
            var at = context.Time.GetUtcNow();
            sessions.Add(
                (at, await context.LoginAsync(account with { Password = password }, recipient))
            );
        }

        // Then credentials have no deadline, old sessions/password fail, and the actor remains signed in.
        Assert.Equal(
            reset ? HttpStatusCode.NoContent : HttpStatusCode.Created,
            response.StatusCode
        );
        Assert.Equal(HttpStatusCode.Unauthorized, oldSession.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, otherSession.StatusCode);
        if (reset)
            Assert.Equal(HttpStatusCode.Unauthorized, oldLogin!.StatusCode);
        Assert.Equal(actor.Id, actorSession!.User.Id);
        Assert.All(
            sessions,
            entry =>
            {
                Assert.False(entry.Session.MustChangePassword);
                Assert.Equal(entry.At.AddDays(30), entry.Session.ExpiresAt);
                Assert.Equal(owner.Id, entry.Session.User.ResponsibleAdministratorId);
            }
        );
        Assert.True(
            await context.ScalarAsync<bool>(
                "SELECT NOT must_change_password AND temporary_password_expires_at IS NULL FROM accounts WHERE id = @Id",
                new { account.Id }
            )
        );
    }

    [Theory(
        DisplayName = "Given an administrator credential and failure history, When demoted to calendar user, Then metadata clears without changing its password or lockout"
    )]
    [InlineData(false, false, false)]
    [InlineData(true, false, false)]
    [InlineData(true, true, false)]
    [InlineData(true, true, true)]
    public async Task DemotionPreservesCredentialAndAttempts(
        bool temporary,
        bool expired,
        bool locked
    )
    {
        // Given a target administrator with a session, optional temporary deadline and failed attempt.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var target = await context.ProvisionAsync(AccountRoles.Administrator);
        await context.LoginAsync(await context.ProvisionAsync());
        using var recipient = await context.CreateAuthenticatedClientAsync(target);
        var hash = await context.ScalarAsync<string>(
            "SELECT password_hash FROM accounts WHERE id = @Id",
            new { target.Id }
        );
        var version = await context.ScalarAsync<Guid>(
            "SELECT security_version FROM accounts WHERE id = @Id",
            new { target.Id }
        );
        var lockedUntil = locked ? context.Time.GetUtcNow().AddMinutes(15) : (DateTimeOffset?)null;
        await context.ExecuteAsync(
            """
            UPDATE accounts SET must_change_password = @Temporary, temporary_password_expires_at = @Deadline,
                locked_until = @LockedUntil WHERE id = @Id;
            INSERT INTO password_failures VALUES (@Id, @Now);
            """,
            new
            {
                target.Id,
                Temporary = temporary,
                Deadline = temporary
                    ? context.Time.GetUtcNow().AddMinutes(expired ? -1 : 30)
                    : (DateTimeOffset?)null,
                LockedUntil = lockedUntil,
                Now = context.Time.GetUtcNow(),
            }
        );

        // When superadmin demotes without replacing the password.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Patch,
            $"/users/{target.Id}/role",
            new { role = AccountRoles.User, responsibleAdministratorId = owner.Id }
        );
        var replay = await recipient.GetAsync("/auth/session");
        var failures = await context.ScalarAsync<int>(
            "SELECT count(*)::int FROM password_failures WHERE account_id = @Id",
            new { target.Id }
        );
        var login = await SendAsync(
            recipient,
            HttpMethod.Post,
            "/auth/login",
            new { target.Username, target.Password }
        );

        // Then sessions are revoked and failure state survives; otherwise eligible users log in normally.
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
        Assert.Equal(1, failures);
        Assert.Equal(
            hash,
            await context.ScalarAsync<string>(
                "SELECT password_hash FROM accounts WHERE id = @Id",
                new { target.Id }
            )
        );
        Assert.NotEqual(
            version,
            await context.ScalarAsync<Guid>(
                "SELECT security_version FROM accounts WHERE id = @Id",
                new { target.Id }
            )
        );
        Assert.True(
            await context.ScalarAsync<bool>(
                "SELECT locked_until IS NOT DISTINCT FROM @LockedUntil FROM accounts WHERE id = @Id",
                new { target.Id, LockedUntil = lockedUntil }
            )
        );
        Assert.True(
            await context.ScalarAsync<bool>(
                "SELECT NOT must_change_password AND temporary_password_expires_at IS NULL FROM accounts WHERE id = @Id",
                new { target.Id }
            )
        );
        Assert.Equal(locked ? HttpStatusCode.Unauthorized : HttpStatusCode.OK, login.StatusCode);
        if (!locked)
            Assert.False((await login.Content.ReadFromJsonAsync<SessionDto>())!.MustChangePassword);
    }

    [Fact(
        DisplayName = "Given a permanent calendar-user password, When changed voluntarily, Then current-password and strength checks apply and every session is revoked"
    )]
    public async Task VoluntaryChangeRequiresFreshLogin()
    {
        // Given an ordinary user with two unrestricted sessions.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var target = await context.ProvisionAsync(AccountRoles.User, owner.Id);
        await context.LoginAsync(target);
        using var second = await context.CreateAuthenticatedClientAsync(target);
        var password = Password();

        // When incorrect, weak, reused and finally valid replacements are submitted.
        var wrong = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/change-password",
            new { currentPassword = Password(), newPassword = password }
        );
        var weak = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/change-password",
            new { currentPassword = target.Password, newPassword = "weak" }
        );
        var same = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/change-password",
            new { currentPassword = target.Password, newPassword = target.Password }
        );
        var changed = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/auth/change-password",
            new { currentPassword = target.Password, newPassword = password }
        );
        var firstReplay = await context.Client.GetAsync("/auth/session");
        var secondReplay = await second.GetAsync("/auth/session");
        var fresh = await context.LoginAsync(target with { Password = password });

        // Then only the compliant verified change succeeds and login with the replacement is unrestricted.
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, weak.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, same.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, changed.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, firstReplay.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, secondReplay.StatusCode);
        Assert.False(fresh.MustChangePassword);
    }
}
