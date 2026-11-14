using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Calendar.Api.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Calendar.Api.Tests;

public sealed class AuthenticationKeyRingTests : IDisposable
{
    private readonly string directory = Path.Combine(
        Path.GetTempPath(),
        $"advent-production-keys-{Guid.NewGuid():N}"
    );
    private const string Password = "isolated-test-pfx-password";

    public AuthenticationKeyRingTests() => Directory.CreateDirectory(directory);

    [Theory(
        DisplayName = "Given invalid external key material, When a Production key ring is created, Then startup refuses the certificate"
    )]
    [InlineData("missing")]
    [InlineData("ambiguous")]
    [InlineData("expired")]
    [InlineData("future")]
    [InlineData("public-only")]
    [InlineData("malformed")]
    [InlineData("wrong-password")]
    [InlineData("missing-password")]
    [InlineData("missing-directory")]
    public void RejectInvalidCertificate(string scenario)
    {
        // Given one deliberately invalid certificate source or key-directory setting.
        var values = Settings(Certificate(scenario));
        switch (scenario)
        {
            case "missing":
                values["Authentication:KeyCertificateBase64"] = null;
                break;
            case "ambiguous":
                values["Authentication:KeyCertificatePath"] = Path.Combine(directory, "also.pfx");
                break;
            case "malformed":
                values["Authentication:KeyCertificateBase64"] = "invalid-base64";
                break;
            case "wrong-password":
                values["Authentication:KeyCertificatePassword"] = "different-password";
                break;
            case "missing-password":
                values["Authentication:KeyCertificatePassword"] = null;
                break;
            case "missing-directory":
                values["Authentication:KeyDirectory"] = Path.Combine(directory, "absent");
                break;
        }
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        var environment = WebApplication
            .CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" })
            .Environment;

        // When startup initializes the provider before migrations and readiness.
        var create = () => new AuthenticationKeyRing(configuration, environment);

        // Then external key material has no ephemeral or plaintext fallback.
        var exception = Assert.Throws<InvalidOperationException>(create);
        Assert.DoesNotContain(Password, exception.Message, StringComparison.Ordinal);
        Assert.Empty(Directory.GetFiles(directory, "key-*.xml"));
    }

    [Fact(
        DisplayName = "Given an encrypted durable key ring, When the backend is replaced with the same PFX, Then protected session data remains readable"
    )]
    public void ReplacementRetainsProtectedData()
    {
        // Given a persisted key ring encrypted with a stable externally supplied PFX.
        var settings = Settings(Certificate());
        string protectedValue;
        using (var original = Provider(settings))
            protectedValue = original.CreateProtector("session").Protect("session-marker");

        // When a replacement backend starts with the same directory and certificate.
        using var replacement = Provider(settings);
        var value = replacement.CreateProtector("session").Unprotect(protectedValue);

        // Then the old session payload survives and keys remain encrypted at rest.
        Assert.Equal("session-marker", value);
        Assert.All(
            Directory.GetFiles(directory, "key-*.xml"),
            file =>
                Assert.Contains("encryptedSecret", File.ReadAllText(file), StringComparison.Ordinal)
        );
    }

    [Fact(
        DisplayName = "Given keys encrypted with an expired former certificate, When its PFX is retained for decryption during renewal, Then existing protected session data remains readable"
    )]
    public void RenewalRetainsOldDecryptionCertificate()
    {
        // Given persisted keys from the old active certificate, now replaced by a new certificate.
        var oldCertificate = Certificate("expired");
        using var expired = X509CertificateLoader.LoadPkcs12(
            Convert.FromBase64String(oldCertificate),
            Password,
            X509KeyStorageFlags.EphemeralKeySet
        );
        var original = DataProtectionProvider.Create(
            new DirectoryInfo(directory),
            protection =>
                protection
                    .SetApplicationName("AdventCalendar.Backend")
                    .ProtectKeysWithCertificate(expired)
        );
        var protectedValue = original.CreateProtector("session").Protect("renewal-marker");
        var settings = Settings(Certificate());
        settings["Authentication:DecryptionCertificates:0:Base64"] = oldCertificate;
        settings["Authentication:DecryptionCertificates:0:Password"] = Password;

        // When a renewed backend reopens the old encrypted key ring with the retained PFX.
        using var renewed = Provider(settings);
        var value = renewed.CreateProtector("session").Unprotect(protectedValue);

        // Then renewal does not force every existing browser session to log in again.
        Assert.Equal("renewal-marker", value);
    }

    private static AuthenticationKeyRing Provider(Dictionary<string, string?> settings) =>
        new(
            new ConfigurationBuilder().AddInMemoryCollection(settings).Build(),
            WebApplication
                .CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" })
                .Environment
        );

    private Dictionary<string, string?> Settings(string certificate) =>
        new()
        {
            ["Authentication:KeyDirectory"] = directory,
            ["Authentication:KeyCertificateBase64"] = certificate,
            ["Authentication:KeyCertificatePassword"] = Password,
        };

    private static string Certificate(string scenario = "valid")
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest(
            "CN=Isolated key-ring test",
            rsa,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1
        );
        var start =
            scenario == "future"
                ? DateTimeOffset.UtcNow.AddDays(1)
                : DateTimeOffset.UtcNow.AddDays(-2);
        var end =
            scenario == "expired"
                ? DateTimeOffset.UtcNow.AddDays(-1)
                : DateTimeOffset.UtcNow.AddDays(2);
        using var certificate = request.CreateSelfSigned(start, end);
        if (scenario == "public-only")
        {
            using var publicOnly = X509CertificateLoader.LoadCertificate(
                certificate.Export(X509ContentType.Cert)
            );
            return Convert.ToBase64String(publicOnly.Export(X509ContentType.Pfx, Password));
        }
        return Convert.ToBase64String(certificate.Export(X509ContentType.Pfx, Password));
    }

    public void Dispose() => Directory.Delete(directory, recursive: true);
}
