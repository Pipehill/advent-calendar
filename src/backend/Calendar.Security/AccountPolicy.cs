using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;

namespace Calendar.Security;

public static class AccountNames
{
    public static string Normalize(string value) => value.ToUpperInvariant();

    public static bool IsValid(string? value)
    {
        if (value is null || value.Length > 128)
            return false;
        var runes = value.EnumerateRunes().ToArray();
        return runes.Length is >= 3 and <= 64
            && runes.All(rune => Rune.IsLetterOrDigit(rune) || rune.Value is '.' or '-' or '_');
    }
}

public static class AccountDisplayNames
{
    public static bool IsValid(string? name) =>
        name is not null
        && AccountPasswordValidator.HasValidEncoding(name)
        && !name.Contains('\0')
        && name.EnumerateRunes().Count() is >= 1 and <= 100
        && name == name.Trim();
}

public sealed class AccountNameNormalizer : ILookupNormalizer
{
    public string? NormalizeName(string? name) =>
        name is null ? null : AccountNames.Normalize(name);

    public string? NormalizeEmail(string? email) => NormalizeName(email);
}

public sealed class AccountPasswordValidator : IPasswordValidator<Account>
{
    private static readonly HashSet<string> Weak = LoadWeakPasswords();

    public Task<IdentityResult> ValidateAsync(
        UserManager<Account> manager,
        Account user,
        string? password
    ) => Task.FromResult(Validate(user.Role, password));

    public static IdentityResult Validate(string role, string? password)
    {
        if (
            !AccountRoles.IsValid(role)
            || password is null
            || password.Length > 256
            || !HasValidEncoding(password)
        )
            return Invalid();
        var runes = password.EnumerateRunes().ToArray();
        var minimum = AccountRoles.IsAdministrator(role) ? 15 : 8;
        if (
            runes.Length < minimum
            || runes.Length > 128
            || !runes.Any(Rune.IsUpper)
            || !runes.Any(Rune.IsLower)
            || !runes.Any(r => Rune.IsPunctuation(r) || Rune.IsSymbol(r))
            || IsWeak(password)
        )
            return Invalid();
        return IdentityResult.Success;
    }

    public static bool HasValidEncoding(string value)
    {
        try
        {
            _ = new UTF8Encoding(false, true).GetByteCount(value);
            return true;
        }
        catch (EncoderFallbackException)
        {
            return false;
        }
    }

    private static bool IsWeak(string password)
    {
        // Also reject obvious capitalization and punctuation/digit decorations.
        var lower = password.ToLowerInvariant();
        var core = new string(lower.Where(char.IsLetter).ToArray());
        return Weak.Contains(Fingerprint(lower))
            || (core.Length >= 4 && Weak.Contains(Fingerprint(core)));
    }

    private static string Fingerprint(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static HashSet<string> LoadWeakPasswords()
    {
        using var stream = typeof(AccountPasswordValidator).Assembly.GetManifestResourceStream(
            "Calendar.Security.WeakPasswords.sha256"
        )!;
        using var reader = new StreamReader(stream);
        return reader
            .ReadToEnd()
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToHashSet(StringComparer.Ordinal);
    }

    private static IdentityResult Invalid() =>
        IdentityResult.Failed(
            new IdentityError
            {
                Code = "PasswordPolicy",
                Description =
                    "Use 8-128 Unicode characters (15 minimum for administrators), uppercase, lowercase and punctuation or a symbol; avoid common passwords.",
            }
        );
}
