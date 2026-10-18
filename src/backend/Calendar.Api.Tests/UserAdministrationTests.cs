using System.Net;
using System.Net.Http.Json;
using Calendar.Api.Generated;
using Calendar.Security;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class UserAdministrationTests(ApiFixture fixture)
{
    [Theory(
        DisplayName = "Given each account role, When an assignable role is created, Then the direct API enforces the permission matrix"
    )]
    [InlineData(AccountRoles.Superadmin, AccountRoles.Administrator, 201)]
    [InlineData(AccountRoles.Superadmin, AccountRoles.User, 201)]
    [InlineData(AccountRoles.Administrator, AccountRoles.User, 201)]
    [InlineData(AccountRoles.Administrator, AccountRoles.Administrator, 403)]
    [InlineData(AccountRoles.User, AccountRoles.User, 403)]
    [InlineData(AccountRoles.User, AccountRoles.Administrator, 403)]
    public async Task CreationEnforcesRoleMatrix(string actorRole, string targetRole, int expected)
    {
        // Given an actor with the selected role and a responsible calendaradmin.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var actor = await context.ProvisionAsync(
            actorRole,
            actorRole == AccountRoles.User ? owner.Id : null
        );
        await context.LoginAsync(actor);
        var username = "recipient-" + Guid.NewGuid().ToString("N");
        var password = Password();
        var request = new Dictionary<string, object>
        {
            ["username"] = username,
            ["password"] = password,
            ["role"] = targetRole,
        };
        if (actorRole == AccountRoles.Superadmin && targetRole == AccountRoles.User)
            request["responsibleAdministratorId"] = owner.Id;

        // When the actor directly invokes account creation.
        var response = await SendAsync(context.Client, HttpMethod.Post, "/users", request);

        // Then only the allowed role combinations persist an account.
        Assert.Equal(expected, (int)response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(
            expected == 201 ? 1 : 0,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM accounts WHERE user_name = @Username",
                new { Username = username }
            )
        );
        if (expected == 201)
        {
            var created = (await response.Content.ReadFromJsonAsync<UserDto>())!;
            Assert.Equal(actor.Id, created.CreatedById);
            Assert.DoesNotContain(
                password,
                await response.Content.ReadAsStringAsync(),
                StringComparison.Ordinal
            );
            Assert.True(
                await context.ScalarAsync<bool>(
                    "SELECT must_change_password AND temporary_password_expires_at = @Deadline FROM accounts WHERE id = @Id",
                    new { created.Id, Deadline = context.Time.GetUtcNow().AddMinutes(30) }
                )
            );
            Assert.Equal(
                actor.Id,
                (await context.Client.GetFromJsonAsync<SessionDto>("/auth/session"))!.User.Id
            );
            if (targetRole == AccountRoles.User)
                Assert.Equal(
                    actorRole == AccountRoles.Administrator ? actor.Id : owner.Id,
                    created.ResponsibleAdministratorId
                );
        }
    }

    [Theory(
        DisplayName = "Given malformed account input, When a superadmin submits it, Then missing fields and role injection produce no writes"
    )]
    [InlineData("missingRole")]
    [InlineData("numericRole")]
    [InlineData("superadminRole")]
    [InlineData("missingUsername")]
    [InlineData("nullPassword")]
    [InlineData("creatorInjection")]
    [InlineData("nullRole")]
    [InlineData("missingResponsible")]
    public async Task CreationRejectsInvalidAndInjectedFields(string scenario)
    {
        // Given a superadmin and malformed or privilege-injecting account input.
        await using var context = await CreateAsync(fixture);
        await context.LoginAsync(await context.ProvisionAsync());
        var request = new Dictionary<string, object?>
        {
            ["username"] = "recipient",
            ["password"] = Password(),
            ["role"] = AccountRoles.Administrator,
        };
        switch (scenario)
        {
            case "missingRole":
                request.Remove("role");
                break;
            case "numericRole":
                request["role"] = 0;
                break;
            case "superadminRole":
                request["role"] = AccountRoles.Superadmin;
                break;
            case "missingUsername":
                request.Remove("username");
                break;
            case "nullPassword":
                request["password"] = null;
                break;
            case "creatorInjection":
                request["createdById"] = Guid.NewGuid();
                break;
            case "nullRole":
                request["role"] = null;
                break;
            case "missingResponsible":
                request["role"] = AccountRoles.User;
                break;
        }

        // When the input is submitted through the generated controller route.
        var response = await SendAsync(context.Client, HttpMethod.Post, "/users", request);

        // Then contract validation or authorization rejects the request without creating an account.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(1, await context.ScalarAsync<int>("SELECT count(*)::int FROM accounts"));
    }

    [Fact(
        DisplayName = "Given an API-created administrator, When the temporary password is used, Then only password setup is allowed until a fresh login"
    )]
    public async Task TemporaryAdministratorMustChangePassword()
    {
        // Given an administrator created with a temporary password through the API.
        await using var context = await CreateAsync(fixture);
        await context.LoginAsync(await context.ProvisionAsync());
        var password = Password();
        var createdResponse = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/users",
            new
            {
                username = "new-admin",
                password,
                role = AccountRoles.Administrator,
            }
        );
        var created = (await createdResponse.Content.ReadFromJsonAsync<UserDto>())!;
        using var recipient = context.Application.CreateClient();
        var account = new TestAccount(
            created.Id,
            created.Username,
            password,
            AccountRoles.Administrator
        );

        // When the temporary session attempts administration, then changes its password and signs in again.
        var restricted = await context.LoginAsync(account, recipient);
        var deniedList = await recipient.GetAsync("/users");
        var deniedCreate = await SendAsync(
            recipient,
            HttpMethod.Post,
            "/users",
            new
            {
                username = "child",
                password = Password(),
                role = AccountRoles.User,
            }
        );
        var deniedRecent = await SendAsync(
            recipient,
            HttpMethod.Post,
            "/auth/reauthenticate",
            new { password }
        );
        var same = await SendAsync(
            recipient,
            HttpMethod.Post,
            "/auth/change-password",
            new { currentPassword = password, newPassword = password }
        );
        var replacement = Password();
        var change = await SendAsync(
            recipient,
            HttpMethod.Post,
            "/auth/change-password",
            new { currentPassword = password, newPassword = replacement }
        );
        var revoked = await recipient.GetAsync("/auth/session");
        var fresh = await context.LoginAsync(account with { Password = replacement }, recipient);
        var allowed = await recipient.GetAsync("/users");

        // Then restricted privileges never leak, all temporary sessions expire and a fresh login grants the role.
        Assert.True(restricted.MustChangePassword);
        Assert.True(restricted.ExpiresAt <= context.Time.GetUtcNow().AddMinutes(10));
        Assert.Equal(HttpStatusCode.Forbidden, deniedList.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, deniedCreate.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, deniedRecent.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, same.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, change.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, revoked.StatusCode);
        Assert.False(fresh.MustChangePassword);
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
    }

    [Fact(
        DisplayName = "Given an administrator's assigned users, When listing and resets are requested, Then SQL scope and fixed responsibility control access"
    )]
    public async Task AssignedUsersControlListingAndResets()
    {
        // Given two administrators and ordinary users assigned independently of audit creator.
        await using var context = await CreateAsync(fixture);
        var first = await context.ProvisionAsync(AccountRoles.Administrator);
        var second = await context.ProvisionAsync(AccountRoles.Administrator);
        var own = await context.ProvisionAsync(AccountRoles.User, first.Id);
        var other = await context.ProvisionAsync(AccountRoles.User, second.Id);
        await context.LoginAsync(first);
        using var recipient = context.Application.CreateClient();
        await context.LoginAsync(own, recipient);

        // When the first administrator lists accounts and attempts scoped and cross-owner resets.
        var list = (await context.Client.GetFromJsonAsync<UserListDto>("/users"))!;
        var cross = await SendAsync(
            context.Client,
            HttpMethod.Post,
            $"/users/{other.Id}/reset-password",
            new { password = Password() }
        );
        var admin = await SendAsync(
            context.Client,
            HttpMethod.Post,
            $"/users/{second.Id}/reset-password",
            new { password = Password() }
        );
        var same = await SendAsync(
            context.Client,
            HttpMethod.Post,
            $"/users/{own.Id}/reset-password",
            new { password = own.Password }
        );
        var temporary = Password();
        var reset = await SendAsync(
            context.Client,
            HttpMethod.Post,
            $"/users/{own.Id}/reset-password",
            new { password = temporary }
        );
        var revoked = await recipient.GetAsync("/auth/session");
        var restricted = await context.LoginAsync(own with { Password = temporary }, recipient);

        // Then only own current ordinary users are listed/reset and reset invalidates all earlier sessions.
        Assert.Equal([own.Id], list.Users.Select(user => user.Id));
        Assert.Equal(HttpStatusCode.Forbidden, cross.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, admin.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, same.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, revoked.StatusCode);
        Assert.True(restricted.MustChangePassword);
    }

    [Fact(
        DisplayName = "Given a user promoted to administrator, When the former responsible administrator acts, Then old credentials and reset authority are revoked"
    )]
    public async Task PromotionReplacesCredentialAndRemovesFormerAuthority()
    {
        // Given an ordinary user, their administrator and a superadmin.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var target = await context.ProvisionAsync(AccountRoles.User, owner.Id);
        var superadmin = await context.ProvisionAsync();
        await context.LoginAsync(superadmin);
        using var recipient = context.Application.CreateClient();
        await context.LoginAsync(target, recipient);
        using var previousOwner = context.Application.CreateClient();
        await context.LoginAsync(owner, previousOwner);

        // When superadmin promotes with a different temporary administrator password.
        var unchanged = await SendAsync(
            context.Client,
            HttpMethod.Patch,
            $"/users/{target.Id}/role",
            new { role = AccountRoles.Administrator, temporaryPassword = target.Password }
        );
        var temporary = Password();
        var promoted = await SendAsync(
            context.Client,
            HttpMethod.Patch,
            $"/users/{target.Id}/role",
            new { role = AccountRoles.Administrator, temporaryPassword = temporary }
        );
        var oldSession = await recipient.GetAsync("/auth/session");
        var oldLogin = await SendAsync(
            recipient,
            HttpMethod.Post,
            "/auth/login",
            new { target.Username, target.Password }
        );
        var oldAuthority = await SendAsync(
            previousOwner,
            HttpMethod.Post,
            $"/users/{target.Id}/reset-password",
            new { password = Password() }
        );
        var list = (await previousOwner.GetFromJsonAsync<UserListDto>("/users"))!;
        var restricted = await context.LoginAsync(target with { Password = temporary }, recipient);

        // Then the credential, sessions and lower-trust reset access are replaced atomically.
        Assert.Equal(HttpStatusCode.Conflict, unchanged.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, promoted.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, oldSession.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, oldAuthority.StatusCode);
        Assert.Empty(list.Users);
        Assert.True(restricted.MustChangePassword);
        Assert.Equal(UserDtoRole.CalendarAdmin, restricted.User.Role);
        Assert.Equal(owner.Id, restricted.User.ResponsibleAdministratorId);
    }

    [Fact(
        DisplayName = "Given an administrator with dependants, When demotion or disable is requested, Then demotion is blocked and disable leaves dependants enabled"
    )]
    public async Task AdministratorDemotionRespectsDependants()
    {
        // Given a responsible administrator with an ordinary dependant.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var replacement = await context.ProvisionAsync(AccountRoles.Administrator);
        var child = await context.ProvisionAsync(AccountRoles.User, owner.Id);
        await context.LoginAsync(await context.ProvisionAsync());
        using var administrator = context.Application.CreateClient();
        await context.LoginAsync(owner, administrator);

        // When superadmin attempts demotion, then disables and re-enables the owner.
        var demotion = await SendAsync(
            context.Client,
            HttpMethod.Patch,
            $"/users/{owner.Id}/role",
            new { role = AccountRoles.User, responsibleAdministratorId = replacement.Id }
        );
        var disabled = await SendAsync(
            context.Client,
            HttpMethod.Patch,
            $"/users/{owner.Id}/status",
            new { enabled = false }
        );
        var enabled = await SendAsync(
            context.Client,
            HttpMethod.Patch,
            $"/users/{owner.Id}/status",
            new { enabled = true }
        );
        var replay = await administrator.GetAsync("/auth/session");

        // Then dependants block demotion, survive disable and old sessions never return.
        Assert.Equal(HttpStatusCode.Conflict, demotion.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, disabled.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, enabled.StatusCode);
        Assert.True(
            await context.ScalarAsync<bool>(
                "SELECT enabled FROM accounts WHERE id = @Id",
                new { child.Id }
            )
        );
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
    }

    [Theory(
        DisplayName = "Given a superadmin target, When API maintenance is attempted, Then even another superadmin cannot change it"
    )]
    [InlineData("POST", "reset-password")]
    [InlineData("PATCH", "status")]
    [InlineData("PATCH", "role")]
    public async Task SuperadminTargetsRemainManual(string method, string operation)
    {
        // Given an acting superadmin and another manually provisioned superadmin.
        await using var context = await CreateAsync(fixture);
        await context.LoginAsync(await context.ProvisionAsync());
        var target = await context.ProvisionAsync();
        object body = operation switch
        {
            "reset-password" => new { password = Password() },
            "status" => new { enabled = false },
            _ => new { role = AccountRoles.Administrator, temporaryPassword = Password() },
        };

        // When an API maintenance route targets that superadmin.
        var response = await SendAsync(
            context.Client,
            new HttpMethod(method),
            $"/users/{target.Id}/{operation}",
            body
        );

        // Then the manual-only boundary holds.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.True(
            await context.ScalarAsync<bool>(
                "SELECT enabled AND account_role = 'superadmin' FROM accounts WHERE id = @Id",
                new { target.Id }
            )
        );
    }
}
