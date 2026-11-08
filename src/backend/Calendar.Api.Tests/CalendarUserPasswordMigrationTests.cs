using System.Net;
using System.Net.Http.Json;
using Calendar.Api.Generated;
using Calendar.Api.Infrastructure;
using Calendar.Security;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class CalendarUserPasswordMigrationTests(ApiFixture fixture)
{
    private const string Migration =
        "Calendar.Api.Migrations.0007_permanent_calendar_user_passwords.sql";

    [Theory(
        DisplayName = "Given legacy calendar-user credentials and business data, When conversion and restart run, Then only pending user metadata and sessions change"
    )]
    [InlineData("pending")]
    [InlineData("expired")]
    [InlineData("permanent")]
    [InlineData("disabled")]
    [InlineData("locked")]
    public async Task TransitionPreservesDataAndJournalsOnce(string state)
    {
        // Given an isolated database, retained hashes, real cookies and calendar content/images.
        await using var calendar = await CalendarTestContext.CreateAsync(fixture);
        var context = calendar.Auth;
        var target = calendar.Recipient;
        var savedCalendar = await calendar.CreateCalendarAsync("Retained calendar");
        var control = await context.ProvisionAsync(AccountRoles.Administrator);
        using var controlClient = await context.CreateAuthenticatedClientAsync(control);
        using var recipient = context.Application.CreateClient();
        var oldCookie = await LoginCookieAsync(context, target, recipient);
        var pending = state != "permanent";
        await context.ExecuteAsync(
            """
            UPDATE accounts SET must_change_password = true, temporary_password_expires_at = @Deadline
            WHERE id = @Control OR (id = @Id AND @Pending);
            UPDATE doors SET content_title = 'Retained title', content_text = 'Retained message',
                image_data = decode('01', 'hex'), image_media_type = 'image/png', image_width = 1,
                image_height = 1, image_version = @Image WHERE calendar_id = @Calendar AND day_number = 1;
            DELETE FROM schemaversions WHERE scriptname = @Migration;
            """,
            new
            {
                target.Id,
                Control = control.Id,
                Pending = pending,
                Deadline = context.Time.GetUtcNow().AddMinutes(30),
                Image = Guid.NewGuid(),
                Calendar = savedCalendar.Id,
                Migration,
            }
        );
        var restrictedCookie = pending ? await LoginCookieAsync(context, target, recipient) : null;
        await context.ExecuteAsync(
            """
            UPDATE accounts SET enabled = @Enabled, locked_until = @LockedUntil,
                temporary_password_expires_at = CASE WHEN @Expired THEN @ExpiredAt ELSE temporary_password_expires_at END
            WHERE id = @Id;
            INSERT INTO password_failures VALUES (@Id, @Now);
            """,
            new
            {
                target.Id,
                Enabled = state != "disabled",
                LockedUntil = state == "locked"
                    ? context.Time.GetUtcNow().AddMinutes(15)
                    : (DateTimeOffset?)null,
                Expired = state == "expired",
                ExpiredAt = context.Time.GetUtcNow().AddMinutes(-1),
                Now = context.Time.GetUtcNow(),
            }
        );
        var before = await PreservedDataAsync(context, target.Id);
        var version = await context.ScalarAsync<Guid>(
            "SELECT security_version FROM accounts WHERE id = @Id",
            new { target.Id }
        );
        await context.Application.DisposeAsync();

        // When actual startup converts legacy state with the old backend stopped.
        await DatabaseStartup.MigrateAsync(context.ConnectionString, 1, CancellationToken.None);
        var after = await PreservedDataAsync(context, target.Id);
        var convertedVersion = await context.ScalarAsync<Guid>(
            "SELECT security_version FROM accounts WHERE id = @Id",
            new { target.Id }
        );
        var retainedFailures = await context.ScalarAsync<int>(
            "SELECT count(*)::int FROM password_failures WHERE account_id = @Id",
            new { target.Id }
        );
        await using var restarted = fixture.Application(
            connectionString: context.ConnectionString,
            time: context.Time
        );
        using var fresh = restarted.CreateClient();
        var replay = await ReplayCookieAsync(fresh, oldCookie);
        var restrictedReplay = restrictedCookie is null
            ? null
            : await ReplayCookieAsync(fresh, restrictedCookie);
        var login = await SendAsync(
            fresh,
            HttpMethod.Post,
            "/auth/login",
            new { target.Username, target.Password }
        );
        var latestVersion = await context.ScalarAsync<Guid>(
            "SELECT security_version FROM accounts WHERE id = @Id",
            new { target.Id }
        );
        await DatabaseStartup.MigrateAsync(context.ConnectionString, 1, CancellationToken.None);
        var sessionAfterRepeat = await fresh.GetAsync("/auth/session");

        // Then hashes, lockout/failures, identities, administrators and calendar bytes survive unchanged.
        Assert.Equal(before, after);
        Assert.Equal(1, retainedFailures);
        Assert.Equal(pending, version != convertedVersion);
        Assert.Equal(convertedVersion, latestVersion);
        Assert.True(
            await context.ScalarAsync<bool>(
                "SELECT NOT must_change_password AND temporary_password_expires_at IS NULL FROM accounts WHERE id = @Id",
                new { target.Id }
            )
        );
        Assert.Equal(pending ? HttpStatusCode.Unauthorized : HttpStatusCode.OK, replay.StatusCode);
        if (pending)
            Assert.Equal(HttpStatusCode.Unauthorized, restrictedReplay!.StatusCode);
        var eligible = state is not ("disabled" or "locked");
        Assert.Equal(eligible ? HttpStatusCode.OK : HttpStatusCode.Unauthorized, login.StatusCode);
        Assert.Equal(
            eligible ? HttpStatusCode.OK : HttpStatusCode.Unauthorized,
            sessionAfterRepeat.StatusCode
        );
        if (eligible)
        {
            var session = (await login.Content.ReadFromJsonAsync<SessionDto>())!;
            Assert.False(session.MustChangePassword);
            Assert.Equal(context.Time.GetUtcNow().AddDays(30), session.ExpiresAt);
        }
        Assert.Equal(
            1,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM schemaversions WHERE scriptname = @Migration",
                new { Migration }
            )
        );
    }

    [Fact(
        DisplayName = "Given conversion fails while revoking sessions, When startup aborts, Then account metadata and the migration journal roll back together"
    )]
    public async Task FailedConversionRollsBackAllWrites()
    {
        // Given pending legacy credentials and a trigger that rejects the later session write.
        await using var context = await CreateAsync(fixture);
        var owner = await context.ProvisionAsync(AccountRoles.Administrator);
        var target = await context.ProvisionAsync(AccountRoles.User, owner.Id);
        await context.LoginAsync(target);
        await context.ExecuteAsync(
            """
            UPDATE accounts SET must_change_password = true, temporary_password_expires_at = @Deadline WHERE id = @Id;
            DELETE FROM schemaversions WHERE scriptname = @Migration;
            CREATE FUNCTION reject_conversion_session() RETURNS TRIGGER AS $$
            BEGIN RAISE EXCEPTION 'Isolated conversion failure'; END; $$ LANGUAGE plpgsql;
            CREATE TRIGGER reject_conversion_session BEFORE UPDATE ON account_sessions
            FOR EACH ROW EXECUTE FUNCTION reject_conversion_session();
            """,
            new
            {
                target.Id,
                Deadline = context.Time.GetUtcNow().AddMinutes(-1),
                Migration,
            }
        );
        var before = await context.ScalarAsync<string>(
            "SELECT row_to_json(a)::text FROM accounts a WHERE id = @Id",
            new { target.Id }
        );
        await context.Application.DisposeAsync();

        // When actual migration startup fails after the account update but before session revocation.
        var migrate = () =>
            DatabaseStartup.MigrateAsync(context.ConnectionString, 1, CancellationToken.None);

        // Then the whole script rolls back and the next startup can safely retry it.
        await Assert.ThrowsAsync<InvalidOperationException>(migrate);
        Assert.Equal(
            before,
            await context.ScalarAsync<string>(
                "SELECT row_to_json(a)::text FROM accounts a WHERE id = @Id",
                new { target.Id }
            )
        );
        Assert.Equal(
            0,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM account_sessions WHERE revoked"
            )
        );
        Assert.Equal(
            0,
            await context.ScalarAsync<int>(
                "SELECT count(*)::int FROM schemaversions WHERE scriptname = @Migration",
                new { Migration }
            )
        );
        await context.ExecuteAsync(
            "DROP TRIGGER reject_conversion_session ON account_sessions; DROP FUNCTION reject_conversion_session();"
        );
        await migrate();
        Assert.True(
            await context.ScalarAsync<bool>(
                "SELECT NOT must_change_password AND temporary_password_expires_at IS NULL FROM accounts WHERE id = @Id",
                new { target.Id }
            )
        );
    }

    private static Task<string> PreservedDataAsync(AuthTestContext context, Guid id) =>
        context.ScalarAsync<string>(
            """
            SELECT json_build_object(
                'accounts', (SELECT json_agg(CASE WHEN a.id = @Id
                    THEN to_jsonb(a) - 'must_change_password' - 'temporary_password_expires_at' - 'security_version'
                    ELSE to_jsonb(a) END ORDER BY a.id) FROM accounts a),
                'otherSessions', (SELECT json_agg(s ORDER BY s.id) FROM account_sessions s WHERE account_id <> @Id),
                'sessionLifetimes', (SELECT json_agg(json_build_array(id, created_at, expires_at, is_restricted) ORDER BY id)
                    FROM account_sessions WHERE account_id = @Id),
                'failures', (SELECT json_agg(f ORDER BY f.account_id, f.occurred_at) FROM password_failures f),
                'calendars', (SELECT json_agg(c ORDER BY c.id) FROM calendars c),
                'doors', (SELECT json_agg(d ORDER BY d.calendar_id, d.day_number) FROM doors d)
            )::text
            """,
            new { Id = id }
        );

    private static async Task<string> LoginCookieAsync(
        AuthTestContext context,
        TestAccount account,
        HttpClient client
    )
    {
        var response = await SendAsync(
            client,
            HttpMethod.Post,
            "/auth/login",
            new { account.Username, account.Password }
        );
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return response
            .Headers.GetValues("Set-Cookie")
            .Single(cookie => cookie.StartsWith("advent.auth=", StringComparison.Ordinal))
            .Split(';')[0];
    }

    private static Task<HttpResponseMessage> ReplayCookieAsync(HttpClient client, string cookie)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/auth/session");
        request.Headers.Add("Cookie", cookie);
        return client.SendAsync(request);
    }
}
