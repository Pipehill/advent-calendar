using System.Diagnostics;
using System.Text;
using Calendar.Security;

if (
    args.Length != 2
    || !AccountNames.IsValid(args[0])
    || !AccountRoles.IsValid(args[1])
    || Console.IsInputRedirected
)
{
    Console.Error.WriteLine(
        "Usage: dotnet run --project src/backend/Calendar.PasswordTool -- <username> <role>\nUse an interactive terminal; passwords are never accepted as arguments or redirected input."
    );
    return 1;
}

Console.Error.Write("Password (hidden): ");
var input = new StringBuilder();
while (true)
{
    var key = Console.ReadKey(intercept: true);
    if (key.Key == ConsoleKey.Enter)
        break;
    if (key.Key == ConsoleKey.Backspace && input.Length > 0)
        input.Length--;
    else if (!char.IsControl(key.KeyChar) && input.Length < 257)
        input.Append(key.KeyChar);
}
Console.Error.WriteLine();
var password = input.ToString();
input.Clear();
if (!AccountPasswordValidator.Validate(args[1], password).Succeeded)
{
    Console.Error.WriteLine("Password does not meet the role's policy.");
    return 1;
}
var started = Stopwatch.GetTimestamp();
var hash = new ArgonPasswordHasher().HashPassword(new Account(), password);
Console.Error.WriteLine(
    $"Argon2id: 64 MiB, 3 passes, p=1; {Stopwatch.GetElapsedTime(started).TotalMilliseconds:F0} ms. Treat the hash output as sensitive operator material."
);
Console.WriteLine(AccountNames.Normalize(args[0]));
Console.WriteLine(hash);
return 0;
