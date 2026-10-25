using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Calendar.Api.Generated;
using Calendar.Api.Infrastructure;
using Calendar.Security;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class AccountNameTests(ApiFixture fixture)
{
    [Theory(
        DisplayName = "Given each account role, When session JSON is emitted, Then its role matches the authored camelCase wire enum"
    )]
    [InlineData(AccountRoles.Superadmin)]
    [InlineData(AccountRoles.Administrator)]
    [InlineData(AccountRoles.User)]
    public async Task RoleWireValuesMatchContract(string role)
    {
        // Given a manually provisioned account with an independently stored role.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var account = await context.ProvisionAsync(
            role,
            role == AccountRoles.User ? owner.Id : null
        );
        await context.LoginAsync(account);

        // When the session endpoint serializes actual HTTP JSON.
        var response = await context.Client.GetAsync("/auth/session");
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        // Then TypeScript consumers receive exactly the authored role value.
        Assert.Equal(role, json.RootElement.GetProperty("user").GetProperty("role").GetString());
    }

    [Theory(
        DisplayName = "Given an invalid name, When account creation is requested, Then a name field error prevents persistence"
    )]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" \t\u00a0\u2003 ")]
    [InlineData("\0")]
    [InlineData("missing")]
    [InlineData("overlong")]
    public async Task InvalidNamesCannotCreateAccounts(string? value)
    {
        // Given a superadmin and a creation request with an invalid or missing name.
        await using var context = await CreateAsync(fixture);
        await context.LoginAsync(await context.ProvisionAsync());
        var body = new Dictionary<string, object?>
        {
            ["username"] = "new-account",
            ["password"] = Password(),
            ["role"] = AccountRoles.Administrator,
        };
        if (value != "missing")
            body["name"] =
                value == "overlong" ? string.Concat(Enumerable.Repeat("🎄", 101)) : value;

        // When the real contract and service validate the request.
        var response = await SendAsync(context.Client, HttpMethod.Post, "/users", body);

        // Then no account is added and the correct field is identified.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("\"name\"", await response.Content.ReadAsStringAsync());
        Assert.Equal(1, await context.ScalarAsync<int>("SELECT count(*)::int FROM accounts"));
    }

    [Theory(
        DisplayName = "Given a valid Unicode name, When an account is created and signs in, Then storage session and list preserve its trimmed code points"
    )]
    [InlineData("  Ærlig Ørn Åse 🎄  ")]
    [InlineData("hundred")]
    [InlineData(" <script>alert('name')</script> ")]
    public async Task UnicodeNamesRoundTrip(string input)
    {
        // Given a name with internal spaces, markup-like text or exactly 100 supplementary code points.
        await using var context = await CreateAsync(fixture);
        await context.LoginAsync(await context.ProvisionAsync());
        var name =
            input == "hundred"
                ? "\u2003" + string.Concat(Enumerable.Repeat("🎄", 100)) + "\u00a0"
                : input;
        var password = Password();

        // When creation, session inspection and authorized listing read the same account.
        var response = await SendAsync(
            context.Client,
            HttpMethod.Post,
            "/users",
            new
            {
                username = "named-admin",
                name,
                password,
                role = AccountRoles.Administrator,
            }
        );
        var account = (await response.Content.ReadFromJsonAsync<UserDto>())!;
        using var recipient = context.Application.CreateClient();
        var session = await context.LoginAsync(
            new TestAccount(account.Id, account.Username, password, AccountRoles.Administrator),
            recipient
        );
        var inspection = (await recipient.GetFromJsonAsync<SessionDto>("/auth/session"))!;
        var list = (await context.Client.GetFromJsonAsync<UserListDto>("/users"))!;

        // Then display names stay distinct from identity and retain every stored Unicode code point.
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(name.Trim(), account.Name);
        Assert.Equal(account.Name, session.User.Name);
        Assert.Equal(account.Name, inspection.User.Name);
        Assert.Equal(account.Name, list.Users.Single(user => user.Id == account.Id).Name);
        Assert.Equal(
            account.Name,
            await context.ScalarAsync<string>(
                "SELECT name FROM accounts WHERE id = @Id",
                new { account.Id }
            )
        );
    }

    [Fact(
        DisplayName = "Given accounts predating names, When the new migration runs, Then usernames are backfilled without changing credentials or roles"
    )]
    public async Task MigrationBackfillsExistingAccounts()
    {
        // Given an isolated account with the previously released schema and journal entries.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionAsync(username: "Ærlig.Ørn");
        var hash = await context.ScalarAsync<string>(
            "SELECT password_hash FROM accounts WHERE id = @Id",
            new { account.Id }
        );
        await context.ExecuteAsync(
            "ALTER TABLE accounts DROP COLUMN name; DELETE FROM schemaversions WHERE scriptname = 'Calendar.Api.Migrations.0003_add_account_name.sql'"
        );

        // When startup applies the new embedded migration twice.
        await DatabaseStartup.MigrateAsync(context.ConnectionString, 1, CancellationToken.None);
        await DatabaseStartup.MigrateAsync(context.ConnectionString, 1, CancellationToken.None);

        // Then the account is preserved with its username as its initial display name.
        Assert.Equal(
            account.Username,
            await context.ScalarAsync<string>(
                "SELECT name FROM accounts WHERE id = @Id",
                new { account.Id }
            )
        );
        Assert.Equal(
            hash,
            await context.ScalarAsync<string>(
                "SELECT password_hash FROM accounts WHERE id = @Id",
                new { account.Id }
            )
        );
        Assert.Equal(
            account.Role,
            (await context.LoginAsync(account)).User.Role.ToString().ToLowerInvariant()
        );
    }

    [Fact(
        DisplayName = "Given a named ordinary account, When password status and role change, Then its name and original responsibility remain intact"
    )]
    public async Task SecurityOperationsPreserveName()
    {
        // Given an ordinary account with a name independent of its username.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var target = await context.ProvisionAsync(AccountRoles.User, owner.Id);
        const string name = "Ærlig Ørn 🎄";
        await context.ExecuteAsync(
            "UPDATE accounts SET name = @Name WHERE id = @Id",
            new { Name = name, target.Id }
        );
        using var recipient = await context.CreateAuthenticatedClientAsync(target);
        await context.LoginAsync(await context.ProvisionAsync());

        // When the account changes its own password, is promoted and is disabled.
        var ownChange = await SendAsync(
            recipient,
            HttpMethod.Post,
            "/auth/change-password",
            new { currentPassword = target.Password, newPassword = Password() }
        );
        var promotion = await SendAsync(
            context.Client,
            HttpMethod.Patch,
            $"/users/{target.Id}/role",
            new { role = AccountRoles.Administrator, temporaryPassword = Password() }
        );
        var status = await SendAsync(
            context.Client,
            HttpMethod.Patch,
            $"/users/{target.Id}/status",
            new { enabled = false }
        );
        var list = (await context.Client.GetFromJsonAsync<UserListDto>("/users"))!;

        // Then security mutations preserve display data and immutable responsibility.
        Assert.Equal(HttpStatusCode.NoContent, ownChange.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, promotion.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, status.StatusCode);
        var account = list.Users.Single(user => user.Id == target.Id);
        Assert.Equal(name, account.Name);
        Assert.Equal(owner.Id, account.ResponsibleAdministratorId);
    }

    [Theory(
        DisplayName = "Given a direct database write, When an invalid account name is stored, Then PostgreSQL enforces name constraints"
    )]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\u00a0Name")]
    [InlineData("Name\u2003")]
    [InlineData("overlong")]
    public async Task DatabaseRejectsInvalidNames(string? input)
    {
        // Given a valid fixture account and a value bypassing application validation.
        await using var context = await CreateAsync(fixture);
        var account = await context.ProvisionAsync();
        var name = input == "overlong" ? new string('Æ', 101) : input;

        // When a direct database operation attempts to replace its name.
        var write = () =>
            context.ExecuteAsync(
                "UPDATE accounts SET name = @Name WHERE id = @Id",
                new { Name = name, account.Id }
            );

        // Then database constraints prevent invalid persisted values.
        await Assert.ThrowsAsync<Npgsql.PostgresException>(write);
    }
}
