using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Calendar.Api.Infrastructure;
using Microsoft.AspNetCore.DataProtection;

namespace Calendar.Api.Authentication;

public sealed class AuthenticationKeyRing : IDataProtectionProvider, IDisposable
{
    private readonly IDataProtectionProvider provider;
    private readonly List<X509Certificate2> certificates = [];

    public AuthenticationKeyRing(IConfiguration configuration, IHostEnvironment environment)
    {
        var directory = configuration["Authentication:KeyDirectory"];
        if (ProductionHosting.IsLocal(environment))
        {
            provider = DataProtectionProvider.Create(
                new DirectoryInfo(
                    directory ?? Path.Combine(environment.ContentRootPath, ".auth-keys")
                ),
                protection => protection.SetApplicationName("AdventCalendar.Backend")
            );
            return;
        }
        if (
            string.IsNullOrWhiteSpace(directory)
            || !Path.IsPathFullyQualified(directory)
            || !Directory.Exists(directory)
        )
            throw new InvalidOperationException(
                "Production authentication requires a durable absolute key directory and external key-encryption certificate."
            );
        VerifyWritable(directory);
        try
        {
            var active = LoadCertificate(
                configuration.GetSection("Authentication"),
                "KeyCertificate",
                requireCurrent: true
            );
            certificates.Add(active);
            foreach (
                var retained in configuration
                    .GetSection("Authentication:DecryptionCertificates")
                    .GetChildren()
            )
                certificates.Add(LoadCertificate(retained, "", requireCurrent: false));
            provider = DataProtectionProvider.Create(
                new DirectoryInfo(directory),
                protection =>
                    protection
                        .SetApplicationName("AdventCalendar.Backend")
                        .ProtectKeysWithCertificate(active)
                        .UnprotectKeysWithAnyCertificate([.. certificates])
            );
        }
        catch
        {
            Dispose();
            throw;
        }
    }

    public IDataProtector CreateProtector(string purpose) => provider.CreateProtector(purpose);

    private static X509Certificate2 LoadCertificate(
        IConfiguration configuration,
        string prefix,
        bool requireCurrent
    )
    {
        var path = configuration[prefix + "Path"];
        var encoded = configuration[prefix + "Base64"];
        var password = configuration[prefix + "Password"];
        var hasPath = !string.IsNullOrWhiteSpace(path);
        var hasEncoded = !string.IsNullOrWhiteSpace(encoded);
        if (
            hasPath == hasEncoded
            || string.IsNullOrWhiteSpace(password)
            || (hasPath && !Path.IsPathFullyQualified(path!))
        )
            throw new InvalidOperationException(
                "Production authentication requires exactly one external PFX source and its password for each certificate."
            );

        X509Certificate2 certificate;
        try
        {
            certificate = hasPath
                ? X509CertificateLoader.LoadPkcs12FromFile(
                    path!,
                    password,
                    X509KeyStorageFlags.EphemeralKeySet
                )
                : X509CertificateLoader.LoadPkcs12(
                    Convert.FromBase64String(encoded!),
                    password,
                    X509KeyStorageFlags.EphemeralKeySet
                );
        }
        catch (Exception exception)
            when (exception is CryptographicException or FormatException or IOException)
        {
            throw new InvalidOperationException(
                "The authentication PFX could not be loaded with its configured password."
            );
        }
        var now = DateTime.UtcNow;
        if (
            !certificate.HasPrivateKey
            || (
                requireCurrent
                && (
                    certificate.NotBefore.ToUniversalTime() > now
                    || certificate.NotAfter.ToUniversalTime() <= now
                )
            )
        )
        {
            certificate.Dispose();
            throw new InvalidOperationException(
                "The active authentication key certificate must be current and every certificate must include its private key."
            );
        }
        return certificate;
    }

    private static void VerifyWritable(string directory)
    {
        var probe = Path.Combine(directory, $".write-probe-{Guid.NewGuid():N}");
        try
        {
            using var stream = new FileStream(
                probe,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                1,
                FileOptions.DeleteOnClose
            );
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            throw new InvalidOperationException(
                "The authentication key directory must be writable by the backend user."
            );
        }
    }

    public void Dispose()
    {
        (provider as IDisposable)?.Dispose();
        foreach (var certificate in certificates)
            certificate.Dispose();
    }
}
