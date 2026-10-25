using System.Text.Json;
using Calendar.Api.Infrastructure;
using Calendar.Security;
using Dapper;
using Npgsql;

// This fixture deliberately cannot target the persistent development database.
var connectionString =
    Environment.GetEnvironmentVariable("BROWSER_TEST_CONNECTION")
    ?? throw new InvalidOperationException("An isolated browser database is required.");
var settings = new NpgsqlConnectionStringBuilder(connectionString);
if (
    settings.Database is null
    || !settings.Database.StartsWith("browser_", StringComparison.Ordinal)
)
    throw new InvalidOperationException("Only disposable browser_* databases are supported.");

await using var database = new NpgsqlConnection(connectionString);
await database.OpenAsync();
if (args.FirstOrDefault() == "revoke")
{
    await database.ExecuteAsync(
        "UPDATE account_sessions SET revoked = TRUE WHERE account_id = (SELECT id FROM accounts WHERE user_name = @Username)",
        new { Username = args[1] }
    );
    return;
}
if (args.FirstOrDefault() == "expire")
{
    await database.ExecuteAsync(
        "UPDATE accounts SET temporary_password_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE user_name = @Username",
        new { Username = args[1] }
    );
    return;
}
if (args.FirstOrDefault() == "stale-verification")
{
    await database.ExecuteAsync(
        "UPDATE account_sessions SET verified_at = CURRENT_TIMESTAMP - INTERVAL '5 minutes' WHERE account_id = (SELECT id FROM accounts WHERE user_name = @Username)",
        new { Username = args[1] }
    );
    return;
}

var originalOutput = Console.Out;
Console.SetOut(TextWriter.Null);
try
{
    await DatabaseStartup.MigrateAsync(connectionString, 1, CancellationToken.None);
}
finally
{
    Console.SetOut(originalOutput);
}

var administratorId = Guid.NewGuid();
var otherAdministratorId = Guid.NewGuid();
var fixtures = new List<object>();
foreach (
    var (username, role, name, restricted) in new[]
    {
        ("browser-superadmin", AccountRoles.Superadmin, "Ærlig Ørn 🎄", false),
        ("browser-admin", AccountRoles.Administrator, "Kalender Ansvarlig", false),
        ("browser-user", AccountRoles.User, "<b>" + new string('Æ', 90) + "</b>", false),
        ("browser-admin-two", AccountRoles.Administrator, "Annen Ansvarlig", false),
        ("browser-user-two", AccountRoles.User, "Annen Bruker", false),
        ("browser-temporary", AccountRoles.Superadmin, "Midlertidig Bruker", true),
        ("browser-expired", AccountRoles.Administrator, "Utløpt Bruker", true),
        ("browser-restricted-admin", AccountRoles.Administrator, "Begrenset Administrator", true),
    }
)
{
    var password = "Ærlig!" + Guid.NewGuid().ToString("N");
    var id = username switch
    {
        "browser-admin" => administratorId,
        "browser-admin-two" => otherAdministratorId,
        _ => Guid.NewGuid(),
    };
    Guid? responsible = null;
    if (role == AccountRoles.User)
        responsible = username == "browser-user-two" ? otherAdministratorId : administratorId;
    var hash = new ArgonPasswordHasher().HashPassword(new Account(), password);
    await database.ExecuteAsync(
        """
        INSERT INTO accounts (id, name, user_name, normalized_user_name, password_hash,
            account_role, security_version, created_at, responsible_administrator_id,
            must_change_password, temporary_password_expires_at)
        VALUES (@Id, @Name, @Username, @Normalized, @Hash, @Role, @Version,
            CURRENT_TIMESTAMP, @Responsible, @Restricted, @Deadline)
        """,
        new
        {
            Id = id,
            Name = name,
            Username = username,
            Normalized = AccountNames.Normalize(username),
            Hash = hash,
            Role = role,
            Version = Guid.NewGuid(),
            Responsible = responsible,
            Restricted = restricted,
            Deadline = restricted ? (DateTimeOffset?)DateTimeOffset.UtcNow.AddMinutes(30) : null,
        }
    );
    fixtures.Add(
        new
        {
            id,
            username,
            password,
            name,
            role,
            restricted,
        }
    );
}

// Fill beyond one list page without adding expensive password hashes or usable accounts.
await database.ExecuteAsync(
    """
    INSERT INTO accounts (id, name, user_name, normalized_user_name, password_hash,
        account_role, security_version, created_at, enabled)
    SELECT gen_random_uuid(), 'Pagination ' || value, 'page-' || lpad(value::text, 3, '0'),
        'PAGE-' || lpad(value::text, 3, '0'), 'disabled-fixture', 'superadmin',
        gen_random_uuid(), CURRENT_TIMESTAMP, FALSE FROM generate_series(1, 51) AS value
    """
);

// The runner captures this in memory; never log or save fixture credentials.
Console.WriteLine(JsonSerializer.Serialize(fixtures));
