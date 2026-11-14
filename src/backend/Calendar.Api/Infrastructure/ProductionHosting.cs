using System.Net;
using System.Net.Sockets;
using Microsoft.AspNetCore.HttpOverrides;
using Npgsql;

namespace Calendar.Api.Infrastructure;

public static class ProductionHosting
{
    public static bool IsLocal(IHostEnvironment environment) =>
        environment.IsDevelopment() || environment.IsEnvironment("Testing");

    public static string ReadConnectionString(
        IConfiguration configuration,
        IHostEnvironment environment
    )
    {
        var value = configuration.GetConnectionString("Calendar");
        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException("Calendar connection string is required.");
        if (IsLocal(environment))
            return value;

        NpgsqlConnectionStringBuilder connection;
        try
        {
            connection = new NpgsqlConnectionStringBuilder(value);
        }
        catch (ArgumentException)
        {
            // Do not include a supplied connection string in startup diagnostics.
            throw new InvalidOperationException("Production database configuration is invalid.");
        }
        if (
            string.IsNullOrWhiteSpace(connection.Host)
            || string.IsNullOrWhiteSpace(connection.Database)
            || string.IsNullOrWhiteSpace(connection.Username)
            || connection.Username is "advent" or "postgres"
            || string.IsNullOrWhiteSpace(connection.Password)
            || connection.Password is "local-development" or "postgres" or "password"
        )
            throw new InvalidOperationException(
                "Production requires explicit nondefault application database credentials."
            );
        if (
            connection.MaxPoolSize is < 1 or > 20
            || connection.Timeout is < 1 or > 15
            || connection.CommandTimeout is < 1 or > 30
        )
            throw new InvalidOperationException(
                "Production requires bounded database pooling and timeouts (maximum pool 20, connection 15s, command 30s)."
            );
        return value;
    }

    public static ForwardedHeadersOptions ReadProxyOptions(
        IConfiguration configuration,
        IHostEnvironment environment
    )
    {
        if (
            configuration.GetValue<bool>("FORWARDEDHEADERS_ENABLED")
            || configuration.GetValue<bool>("ASPNETCORE_FORWARDEDHEADERS_ENABLED")
        )
            throw new InvalidOperationException(
                "Do not enable automatic forwarded headers; configure explicit trusted BFF peers instead."
            );
        var options = new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedProto,
            ForwardLimit = 1,
        };
        options.KnownProxies.Clear();
        options.KnownIPNetworks.Clear();
        foreach (var entry in configuration.GetSection("Hosting:KnownProxies").GetChildren())
        {
            if (!IPAddress.TryParse(entry.Value, out var address) || !IsUnicast(address))
                throw new InvalidOperationException(
                    "Hosting:KnownProxies requires explicit unicast IP addresses."
                );
            options.KnownProxies.Add(address);
        }
        foreach (var entry in configuration.GetSection("Hosting:KnownNetworks").GetChildren())
        {
            if (
                !System.Net.IPNetwork.TryParse(entry.Value, out var network)
                || !IsUnicast(network.BaseAddress)
                || network.PrefixLength
                    < (network.BaseAddress.AddressFamily == AddressFamily.InterNetwork ? 24 : 64)
            )
                throw new InvalidOperationException(
                    "Hosting:KnownNetworks requires a narrow server-container CIDR (IPv4 /24 or narrower, IPv6 /64 or narrower)."
                );
            options.KnownIPNetworks.Add(network);
        }
        if (
            !IsLocal(environment)
            && options.KnownProxies.Count == 0
            && options.KnownIPNetworks.Count == 0
        )
            throw new InvalidOperationException(
                "Production requires explicit trusted BFF proxy addresses or a narrow server-container CIDR."
            );
        // An empty list means trust-all to the middleware. Never install it locally
        // without an explicit peer; local HTTP does not need forwarded scheme trust.
        if (options.KnownProxies.Count == 0 && options.KnownIPNetworks.Count == 0)
            options.ForwardedHeaders = ForwardedHeaders.None;
        return options;
    }

    private static bool IsUnicast(IPAddress address) =>
        !address.Equals(IPAddress.Any)
        && !address.Equals(IPAddress.IPv6Any)
        && !address.Equals(IPAddress.Broadcast)
        && !address.IsIPv6Multicast
        && (
            address.AddressFamily != AddressFamily.InterNetwork
            || address.GetAddressBytes()[0] < 224
        );
}
