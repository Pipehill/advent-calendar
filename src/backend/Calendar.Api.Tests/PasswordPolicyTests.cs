using Calendar.Security;
using Microsoft.AspNetCore.Identity;
using Xunit;

namespace Calendar.Api.Tests;

public sealed class PasswordPolicyTests
{
    [Fact(
        DisplayName = "Given a hash with higher memory but older passes, When costs upgrade, Then neither memory nor passes are reduced"
    )]
    public void MixedHashCostsUpgradeWithoutDowngrade()
    {
        // Given a supported stored hash with 128 MiB but only two passes.
        var password = AuthTestContext.Password();
        Span<char> previous = stackalloc char[Geralt.Argon2id.HashSize];
        Geralt.Argon2id.ComputeHash(
            previous,
            System.Text.Encoding.UTF8.GetBytes(password),
            2,
            128 * 1024 * 1024
        );
        var account = new Account { PasswordHash = previous.ToString().TrimEnd('\0') };
        var hasher = new ArgonPasswordHasher();

        // When successful verification requests an upgrade and a replacement hash is generated.
        var verified = hasher.VerifyHashedPassword(account, account.PasswordHash, password);
        var upgraded = hasher.HashPassword(account, password);

        // Then the upgrade raises passes while preserving higher memory.
        Assert.Equal(PasswordVerificationResult.SuccessRehashNeeded, verified);
        Assert.StartsWith("$argon2id$v=19$m=131072,t=3,p=1$", upgraded, StringComparison.Ordinal);
    }

    [Theory(
        DisplayName = "Given a username character or length boundary, When shared normalization validates it, Then only the agreed global identity syntax is accepted"
    )]
    [InlineData("ÆøÅ", true)]
    [InlineData("ab", false)]
    [InlineData("calendar.user-1_ok", true)]
    [InlineData(" padded ", false)]
    [InlineData("user@example.com", false)]
    [InlineData("user🎄", false)]
    public void UsernamesShareGlobalSyntax(string username, bool expected)
    {
        // Given the supplied Unicode username.
        var lowercase = username.ToLowerInvariant();

        // When the common normalization and syntax policy are applied.
        var valid = AccountNames.IsValid(username);
        var normalized = AccountNames.Normalize(username);

        // Then case matching is shared and unsupported identity syntax is rejected.
        Assert.Equal(expected, valid);
        Assert.Equal(normalized, AccountNames.Normalize(lowercase));
    }

    [Theory(
        DisplayName = "Given a role and Unicode length boundary, When the password is validated, Then the shared role policy enforces code-point limits"
    )]
    [InlineData(AccountRoles.User, 7, false)]
    [InlineData(AccountRoles.User, 8, true)]
    [InlineData(AccountRoles.User, 128, true)]
    [InlineData(AccountRoles.User, 129, false)]
    [InlineData(AccountRoles.Administrator, 14, false)]
    [InlineData(AccountRoles.Administrator, 15, true)]
    [InlineData(AccountRoles.Administrator, 128, true)]
    [InlineData(AccountRoles.Administrator, 129, false)]
    [InlineData(AccountRoles.Superadmin, 14, false)]
    [InlineData(AccountRoles.Superadmin, 15, true)]
    [InlineData(AccountRoles.Superadmin, 128, true)]
    [InlineData(AccountRoles.Superadmin, 129, false)]
    public void PasswordLengthUsesCodePoints(string role, int length, bool valid)
    {
        // Given a password containing an astral Unicode symbol and Norwegian case characters.
        var password = "Æø🎄" + new string('z', length - 3);

        // When the shared API/operator policy validates the role and password.
        var result = AccountPasswordValidator.Validate(role, password);

        // Then the role's Unicode code-point boundary is applied.
        Assert.Equal(valid, result.Succeeded);
    }

    [Theory(
        DisplayName = "Given password character classes and common patterns, When validation runs, Then weak or incomplete passwords are rejected"
    )]
    [InlineData("UpperLowerButNoSymbol", false)]
    [InlineData("onlylowercaseletters!", false)]
    [InlineData("ONLYUPPERCASELETTERS!", false)]
    [InlineData("UpperAndLowerSpaces   ", false)]
    [InlineData("Password1!", false)]
    [InlineData("Password12345678!", false)]
    [InlineData("ÆøSomeUnusualWords★", true)]
    [InlineData(" ÆøSomeUnusualWords★ ", true)]
    public void PasswordClassesAndWeakSource(string password, bool valid)
    {
        // Given a candidate with the selected classes or known-weak pattern.
        var role = AccountRoles.User;

        // When validation runs without trimming or making network calls.
        var result = AccountPasswordValidator.Validate(role, password);

        // Then the intended policy accepts only compliant candidates.
        Assert.Equal(valid, result.Succeeded);
    }

    [Fact(
        DisplayName = "Given one password, When two Argon2id hashes are created, Then random salts verify without plaintext persistence"
    )]
    public void ArgonHashesAreSaltedAndStrict()
    {
        // Given a randomly generated test password and the shared Identity hasher.
        var password = AuthTestContext.Password();
        var hasher = new ArgonPasswordHasher();
        var account = new Account();

        // When independently salted hashes and invalid verification inputs are evaluated.
        var first = hasher.HashPassword(account, password);
        var second = hasher.HashPassword(account, password);
        var correct = hasher.VerifyHashedPassword(account, first, password);
        var incorrect = hasher.VerifyHashedPassword(account, first, password + " ");
        var malformed = hasher.VerifyHashedPassword(
            account,
            "$argon2id$v=19$m=999999,t=99,p=9$invalid$invalid",
            password
        );

        // Then salts differ, metadata is versioned and malformed/altered values fail closed.
        Assert.NotEqual(first, second);
        Assert.StartsWith("$argon2id$v=19$m=65536,t=3,p=1$", first, StringComparison.Ordinal);
        Assert.DoesNotContain(password, first, StringComparison.Ordinal);
        Assert.Equal(PasswordVerificationResult.Success, correct);
        Assert.Equal(PasswordVerificationResult.Failed, incorrect);
        Assert.Equal(PasswordVerificationResult.Failed, malformed);
    }
}
