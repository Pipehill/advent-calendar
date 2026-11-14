using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

internal static class TestCertificate
{
    public static void Write(string directory, string password)
    {
        Directory.CreateDirectory(directory);
        using var key = RSA.Create(2048);
        var request = new CertificateRequest(
            "CN=localhost",
            key,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1
        );
        var names = new SubjectAlternativeNameBuilder();
        names.AddDnsName("localhost");
        names.AddIpAddress(System.Net.IPAddress.Loopback);
        request.CertificateExtensions.Add(names.Build());
        using var certificate = request.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddMinutes(-5),
            DateTimeOffset.UtcNow.AddDays(2)
        );
        File.WriteAllBytes(
            Path.Combine(directory, "test.pfx"),
            certificate.Export(X509ContentType.Pfx, password)
        );
        File.WriteAllText(Path.Combine(directory, "test.crt"), certificate.ExportCertificatePem());
        File.WriteAllText(Path.Combine(directory, "test.key"), key.ExportPkcs8PrivateKeyPem());
    }
}
