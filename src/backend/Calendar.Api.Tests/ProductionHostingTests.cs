using System.Net;
using Calendar.Api.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace Calendar.Api.Tests;

public sealed class ProductionHostingTests
{
    [Theory(
        DisplayName = "Given missing or development database settings, When Production configuration is read, Then startup refuses the credentials without disclosing them"
    )]
    [InlineData(null)]
    [InlineData("Host=localhost;Database=advent;Username=advent;Password=local-development")]
    [InlineData("Host=private-db;Database=advent;Username=postgres;Password=private-value")]
    [InlineData("Host=private-db;Database=advent;Username=advent_app")]
    [InlineData("Host=private-db;Database=advent;Username=advent_app;Password=private-value")]
    public void RejectDefaultDatabase(string? connectionString)
    {
        // Given Production settings with missing credentials or unbounded default pools.
        var configuration = Configuration(
            new() { ["ConnectionStrings:Calendar"] = connectionString }
        );
        var environment = WebApplication
            .CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" })
            .Environment;

        // When startup validates the application database before opening a connection.
        var read = () => ProductionHosting.ReadConnectionString(configuration, environment);

        // Then invalid settings fail without returning the supplied password.
        var error = Assert.Throws<InvalidOperationException>(read);
        Assert.DoesNotContain("private-value", error.Message, StringComparison.Ordinal);
    }

    [Fact(
        DisplayName = "Given explicit bounded application credentials, When Production configuration is read, Then the supplied connection remains unchanged"
    )]
    public void AcceptApplicationConnection()
    {
        // Given explicitly bounded, nondefault application credentials on the private network.
        const string connection =
            "Host=private-db;Database=advent;Username=advent_app;Password=unique-example;SSL Mode=Disable;Maximum Pool Size=10;Timeout=3;Command Timeout=5";
        var configuration = Configuration(new() { ["ConnectionStrings:Calendar"] = connection });
        var environment = WebApplication
            .CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" })
            .Environment;

        // When startup reads the validated connection.
        var actual = ProductionHosting.ReadConnectionString(configuration, environment);

        // Then it preserves the owner's explicit private-transport and pool settings.
        Assert.Equal(connection, actual);
    }

    [Theory(
        DisplayName = "Given absent or broad proxy trust, When Production proxy configuration is read, Then startup rejects implicit or trust-all forwarding"
    )]
    [InlineData(null, null)]
    [InlineData("0.0.0.0", null)]
    [InlineData("::", null)]
    [InlineData(null, "0.0.0.0/0")]
    [InlineData(null, "10.0.0.0/8")]
    [InlineData(null, "172.18.0.0/16")]
    [InlineData(null, "::/0")]
    public void RejectBroadProxyTrust(string? proxy, string? network)
    {
        // Given missing trust or a range wider than the intended server-container boundary.
        var configuration = Configuration(
            new() { ["Hosting:KnownProxies:0"] = proxy, ["Hosting:KnownNetworks:0"] = network }
        );
        var environment = WebApplication
            .CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" })
            .Environment;

        // When startup validates the forwarding boundary.
        var read = () => ProductionHosting.ReadProxyOptions(configuration, environment);

        // Then no unbounded or implicit proxy trust reaches request processing.
        Assert.Throws<InvalidOperationException>(read);
    }

    [Fact(
        DisplayName = "Given explicit proxy peers, When Production proxy configuration is read, Then only a single forwarded scheme is trusted"
    )]
    public void TrustSchemeOnly()
    {
        // Given the actual BFF IP and a narrowly scoped server-container CIDR.
        var configuration = Configuration(
            new()
            {
                ["Hosting:KnownProxies:0"] = "10.12.0.4",
                ["Hosting:KnownNetworks:0"] = "10.12.0.0/24",
            }
        );
        var environment = WebApplication
            .CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" })
            .Environment;

        // When the middleware configuration is prepared.
        var options = ProductionHosting.ReadProxyOptions(configuration, environment);

        // Then host, identity and client IP chains remain outside the trust boundary.
        Assert.Equal(ForwardedHeaders.XForwardedProto, options.ForwardedHeaders);
        Assert.Equal(1, options.ForwardLimit);
        Assert.Single(options.KnownProxies);
        Assert.Single(options.KnownIPNetworks);
    }

    [Fact(
        DisplayName = "Given automatic forwarded headers enabled, When explicit proxy configuration is read, Then startup refuses the competing trust-all middleware"
    )]
    public void RejectAutomaticForwarding()
    {
        // Given an environment switch that would install trust-all forwarding automatically.
        var configuration = Configuration(
            new()
            {
                ["FORWARDEDHEADERS_ENABLED"] = "true",
                ["Hosting:KnownProxies:0"] = "10.12.0.4",
            }
        );
        var environment = WebApplication
            .CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" })
            .Environment;

        // When startup validates the forwarding boundary.
        var read = () => ProductionHosting.ReadProxyOptions(configuration, environment);

        // Then broad automatic forwarding cannot bypass the explicit allowlist.
        Assert.Throws<InvalidOperationException>(read);
    }

    [Theory(
        DisplayName = "Given a forwarded HTTPS scheme, When the actual peer is checked, Then only the trusted BFF can change scheme while host and client IP remain unchanged"
    )]
    [InlineData("10.12.0.4", "https")]
    [InlineData("10.12.0.5", "http")]
    public async Task ForwardedSchemeChecksActualPeer(string peer, string expectedScheme)
    {
        // Given a private HTTP hop with forged host and client-address chains.
        var configuration = Configuration(new() { ["Hosting:KnownProxies:0"] = "10.12.0.4" });
        var environment = WebApplication
            .CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" })
            .Environment;
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Parse(peer);
        context.Request.Scheme = "http";
        context.Request.Host = new HostString("backend-private");
        context.Request.Headers["X-Forwarded-Proto"] = "https";
        context.Request.Headers["X-Forwarded-Host"] = "attacker.example";
        context.Request.Headers["X-Forwarded-For"] = "203.0.113.4";
        var middleware = new ForwardedHeadersMiddleware(
            _ => Task.CompletedTask,
            NullLoggerFactory.Instance,
            Options.Create(ProductionHosting.ReadProxyOptions(configuration, environment))
        );

        // When the actual framework forwarding middleware processes the request.
        await middleware.Invoke(context);

        // Then peer budgets and backend host remain bound to the real private hop.
        Assert.Equal(expectedScheme, context.Request.Scheme);
        Assert.Equal(IPAddress.Parse(peer), context.Connection.RemoteIpAddress);
        Assert.Equal("backend-private", context.Request.Host.Value);
    }

    private static IConfiguration Configuration(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();
}
