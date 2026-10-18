using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Geralt;
using Microsoft.AspNetCore.Identity;

namespace Calendar.Security;

public sealed partial class ArgonPasswordHasher : IPasswordHasher<Account>
{
    public const int Iterations = 3;
    public const int MemoryBytes = 64 * 1024 * 1024;

    public string HashPassword(Account user, string password)
    {
        var bytes = Encoding.UTF8.GetBytes(password);
        try
        {
            Span<char> output = stackalloc char[Argon2id.HashSize];
            var previous = ReadCosts(user.PasswordHash);
            Argon2id.ComputeHash(
                output,
                bytes,
                Math.Max(Iterations, previous?.Passes ?? 0),
                Math.Max(MemoryBytes, (previous?.MemoryKiB ?? 0) * 1024)
            );
            return output.ToString().TrimEnd('\0');
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

    public PasswordVerificationResult VerifyHashedPassword(
        Account user,
        string hashedPassword,
        string providedPassword
    )
    {
        // Bound costs before asking native code to parse a persisted hash.
        var costs = ReadCosts(hashedPassword);
        if (
            costs is null
            || providedPassword.Length > 256
            || !AccountPasswordValidator.HasValidEncoding(providedPassword)
        )
            return PasswordVerificationResult.Failed;
        var bytes = Encoding.UTF8.GetBytes(providedPassword);
        try
        {
            if (!Argon2id.VerifyHash(hashedPassword, bytes))
                return PasswordVerificationResult.Failed;
            // Never downgrade an intentionally stronger stored configuration.
            return costs.Value.MemoryKiB < MemoryBytes / 1024 || costs.Value.Passes < Iterations
                ? PasswordVerificationResult.SuccessRehashNeeded
                : PasswordVerificationResult.Success;
        }
        catch (Exception error) when (error is FormatException or ArgumentException)
        {
            return PasswordVerificationResult.Failed;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(bytes);
        }
    }

    private static (int MemoryKiB, int Passes)? ReadCosts(string hash)
    {
        var match = Format().Match(hash);
        if (
            !match.Success
            || !int.TryParse(match.Groups[1].Value, out var memory)
            || memory is < 8192 or > 262144
            || !int.TryParse(match.Groups[2].Value, out var passes)
            || passes is < 1 or > 10
            || !int.TryParse(match.Groups[3].Value, out var lanes)
            || lanes is < 1 or > 4
        )
            return null;
        return (memory, passes);
    }

    [GeneratedRegex(
        @"^\$argon2id\$v=19\$m=(\d{1,6}),t=(\d{1,2}),p=(\d)\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$",
        RegexOptions.CultureInvariant,
        100
    )]
    private static partial Regex Format();
}
