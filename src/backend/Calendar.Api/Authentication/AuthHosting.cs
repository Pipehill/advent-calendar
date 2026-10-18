using System.Security.Claims;
using System.Security.Cryptography.X509Certificates;
using System.Threading.RateLimiting;
using Calendar.Security;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Calendar.Api.Authentication;

public static class AuthHosting
{
    public static void LogDenied(HttpContext context, ILogger logger)
    {
        var actor = Guid.TryParse(
            context.User.FindFirstValue(ClaimTypes.NameIdentifier),
            out var actorId
        )
            ? actorId
            : (Guid?)null;
        var target = Guid.TryParse(context.Request.RouteValues["id"]?.ToString(), out var targetId)
            ? targetId
            : (Guid?)null;
        SecurityLog.Event(
            logger,
            context.GetEndpoint()?.DisplayName ?? "account-request",
            actor,
            target,
            "denied"
        );
    }

    public static void AddAccountAuthentication(this WebApplicationBuilder builder)
    {
        var services = builder.Services;
        var local =
            builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing");
        services.AddDataProtection();
        // Resolve final host configuration, including test/deployment overrides,
        // rather than capturing incomplete configuration before builder.Build().
        services.AddSingleton<IDataProtectionProvider>(provider =>
            CreateKeyProvider(provider.GetRequiredService<IConfiguration>(), builder.Environment)
        );
        services.AddScoped<AuthDatabase>();
        services.AddScoped<SessionService>();
        services.AddScoped<SessionCookieEvents>();
        services.AddScoped<AuthenticationService>();
        services.AddScoped<UserAdministration>();
        services.AddScoped<PasswordAttempts>();
        services.AddScoped<IPasswordVerification, PasswordVerification>();
        services.AddScoped<ContractRequestFilter>();
        services.AddSingleton<AccountResourceBudget>();
        var identity = services.AddIdentityCore<Account>();
        // Replace Identity's ASCII/UTF-16/default-hasher policies with the shared,
        // role-aware policies also used by the database-free operator tool.
        services.AddScoped<IUserStore<Account>, AccountStore>();
        services.AddScoped<ILookupNormalizer, AccountNameNormalizer>();
        services.AddScoped<IPasswordHasher<Account>, ArgonPasswordHasher>();
        services.Configure<IdentityOptions>(options => options.User.RequireUniqueEmail = false);
        services.AddScoped<UserManager<Account>>();
        services.AddOptions();
        services.RemoveAll<IPasswordValidator<Account>>();
        services.RemoveAll<IUserValidator<Account>>();
        identity.AddPasswordValidator<AccountPasswordValidator>();
        identity.AddUserValidator<AccountValidator>();
        services
            .AddAuthentication(SessionService.Scheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = "advent.auth";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.SecurePolicy = local
                    ? CookieSecurePolicy.SameAsRequest
                    : CookieSecurePolicy.Always;
                options.Cookie.Path = "/";
                options.SlidingExpiration = false;
                options.EventsType = typeof(SessionCookieEvents);
            });
        services.AddAuthorization();
        services.AddAntiforgery(options =>
        {
            options.Cookie.Name = "advent.csrf";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = local
                ? CookieSecurePolicy.SameAsRequest
                : CookieSecurePolicy.Always;
            options.Cookie.Path = "/";
            options.HeaderName = "X-CSRF-TOKEN";
        });
        services
            .AddOptions<Microsoft.AspNetCore.Authentication.Cookies.CookieAuthenticationOptions>(
                SessionService.Scheme
            )
            .Configure<TimeProvider>((options, time) => options.TimeProvider = time);
    }

    private static IDataProtectionProvider CreateKeyProvider(
        IConfiguration configuration,
        IHostEnvironment environment
    )
    {
        var local = environment.IsDevelopment() || environment.IsEnvironment("Testing");
        var directory = configuration["Authentication:KeyDirectory"];
        if (local)
            return DataProtectionProvider.Create(
                new DirectoryInfo(
                    directory ?? Path.Combine(environment.ContentRootPath, ".auth-keys")
                ),
                protection => protection.SetApplicationName("AdventCalendar.Backend")
            );
        var certificatePath = configuration["Authentication:KeyCertificatePath"];
        if (
            directory is null
            || !Path.IsPathFullyQualified(directory)
            || !Directory.Exists(directory)
            || certificatePath is null
            || !Path.IsPathFullyQualified(certificatePath)
        )
            throw new InvalidOperationException(
                "Production authentication requires a durable absolute key directory and external key-encryption certificate."
            );
        var certificate = X509CertificateLoader.LoadPkcs12FromFile(
            certificatePath,
            configuration["Authentication:KeyCertificatePassword"]
        );
        if (!certificate.HasPrivateKey || certificate.NotAfter.ToUniversalTime() <= DateTime.UtcNow)
            throw new InvalidOperationException(
                "The authentication key certificate must be current and include its private key."
            );
        return DataProtectionProvider.Create(
            new DirectoryInfo(directory),
            protection =>
                protection
                    .SetApplicationName("AdventCalendar.Backend")
                    .ProtectKeysWithCertificate(certificate)
        );
    }

    public static bool IsAccountPath(PathString path) =>
        path.StartsWithSegments("/auth") || path.StartsWithSegments("/users");

    public static void UseAccountResponseProtection(this WebApplication app)
    {
        app.Use(
            async (context, next) =>
            {
                if (!IsAccountPath(context.Request.Path))
                {
                    await next(context);
                    return;
                }
                context.Response.Headers.CacheControl = "no-store";
                context.Response.OnStarting(() =>
                {
                    context.Response.Headers.CacheControl = "no-store";
                    return Task.CompletedTask;
                });
                if (
                    !app.Environment.IsDevelopment()
                    && !app.Environment.IsEnvironment("Testing")
                    && !context.Request.IsHttps
                )
                    throw new AuthFailureException(400, "HTTPS is required");
                await next(context);
            }
        );
    }
}

public sealed class AccountResourceBudget : IDisposable
{
    private readonly ConcurrencyLimiter concurrency = new(
        new ConcurrencyLimiterOptions { PermitLimit = 2, QueueLimit = 0 }
    );
    private readonly FixedWindowRateLimiter global = new(
        new FixedWindowRateLimiterOptions
        {
            PermitLimit = 120,
            QueueLimit = 0,
            Window = TimeSpan.FromMinutes(1),
            AutoReplenishment = true,
        }
    );
    private readonly FixedWindowRateLimiter reads = new(
        new FixedWindowRateLimiterOptions
        {
            PermitLimit = 600,
            QueueLimit = 0,
            Window = TimeSpan.FromMinutes(1),
            AutoReplenishment = true,
        }
    );
    private readonly PartitionedRateLimiter<string> peers = PartitionedRateLimiter.Create<
        string,
        string
    >(peer =>
        RateLimitPartition.GetFixedWindowLimiter(
            peer,
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = peer.StartsWith("read:", StringComparison.Ordinal) ? 120 : 30,
                QueueLimit = 0,
                Window = TimeSpan.FromMinutes(1),
                AutoReplenishment = true,
            }
        )
    );

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        if (!AuthHosting.IsAccountPath(context.Request.Path))
        {
            await next(context);
            return;
        }
        // Peer addresses only: arbitrary Forwarded/X-Forwarded-For headers cannot
        // manufacture fresh budgets. Success never resets these independent limits.
        var read =
            HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method);
        var address = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        using var peer = peers.AttemptAcquire((read ? "read:" : "write:") + address);
        using var aggregate = read ? reads.AttemptAcquire() : global.AttemptAcquire();
        var hashes =
            !read
            && context.Request.Path != "/auth/logout"
            && !context.Request.Path.Value!.EndsWith("/status", StringComparison.Ordinal);
        using var work = hashes ? concurrency.AttemptAcquire() : null;
        if (!peer.IsAcquired || !aggregate.IsAcquired || work is { IsAcquired: false })
            throw new AuthFailureException(429, "Authentication resource limit reached");
        await next(context);
    }

    public void Dispose()
    {
        concurrency.Dispose();
        global.Dispose();
        reads.Dispose();
        peers.Dispose();
    }
}
