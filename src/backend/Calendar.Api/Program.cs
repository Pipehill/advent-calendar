using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using Calendar.Api.Authentication;
using Calendar.Api.Controllers;
using Calendar.Api.Infrastructure;
using Calendar.Api.Repositories;
using Calendar.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

if (args.Contains("--health-probe", StringComparer.Ordinal))
{
    using var probe = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
    try
    {
        var response = await probe.GetAsync("http://localhost:8080/health/ready");
        return response.IsSuccessStatusCode ? 0 : 1;
    }
    catch (HttpRequestException)
    {
        return 1;
    }
    catch (TaskCanceledException)
    {
        return 1;
    }
}

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole(options =>
{
    options.IncludeScopes = true;
    options.UseUtcTimestamp = true;
    options.TimestampFormat = "O";
});
builder
    .Services.AddControllersWithViews(options =>
        options.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true
    )
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
        // NSwag emits EnumMember attributes, which System.Text.Json ignores.
        // Override property converters through metadata so actual JSON follows
        // the authored camelCase role values without editing generated code.
        var resolver = new DefaultJsonTypeInfoResolver();
        resolver.Modifiers.Add(info =>
        {
            foreach (var property in info.Properties)
                if (
                    property.PropertyType.IsEnum
                    && property.PropertyType.Namespace == "Calendar.Api.Generated"
                )
                    property.CustomConverter = new JsonStringEnumConverter(
                        JsonNamingPolicy.CamelCase,
                        allowIntegerValues: false
                    );
        });
        options.JsonSerializerOptions.TypeInfoResolver = resolver;
    });
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
        ApiErrors.Create(
            context.HttpContext,
            400,
            "Invalid request",
            context.ModelState.ToDictionary(
                entry => entry.Key,
                entry =>
                    entry
                        .Value!.Errors.Select(error =>
                            error.ErrorMessage.Length > 0
                                ? error.ErrorMessage
                                : "Invalid JSON value."
                        )
                        .ToList()
            )
        );
    options.SuppressMapClientErrors = true;
});
builder.Services.AddSingleton(TimeProvider.System);
builder.AddAccountAuthentication();
builder.Services.AddSingleton(provider =>
    NpgsqlDataSource.Create(
        provider.GetRequiredService<IConfiguration>().GetConnectionString("Calendar")
            ?? throw new InvalidOperationException("Calendar connection string is required.")
    )
);
builder.Services.AddScoped<ICalendarService, CalendarService>();
builder.Services.AddScoped<ICalendarRepository, CalendarRepository>();
builder.Services.AddSingleton<MigrationState>();
builder.Services.AddHealthChecks().AddCheck<DatabaseHealthCheck>("database");

var app = builder.Build();
_ = app.Services.GetRequiredService<Microsoft.AspNetCore.DataProtection.IDataProtectionProvider>();
var connectionString =
    app.Configuration.GetConnectionString("Calendar")
    ?? throw new InvalidOperationException("Calendar connection string is required.");
await DatabaseStartup.MigrateAsync(
    connectionString,
    app.Configuration.GetValue("Database:StartupAttempts", 10),
    app.Lifetime.ApplicationStopping
);
app.Services.GetRequiredService<MigrationState>().Complete = true;

app.Use(
    async (context, next) =>
    {
        using var scope = app.Logger.BeginScope(
            new Dictionary<string, object>
            {
                ["service"] = "calendar-api",
                ["traceId"] = Activity.Current?.TraceId.ToString() ?? context.TraceIdentifier,
                ["method"] = context.Request.Method,
                ["path"] = context.Request.Path.ToString(),
            }
        );
        try
        {
            await next(context);
            ApiLog.RequestCompleted(app.Logger, context.Response.StatusCode);
            if (
                AuthHosting.IsAccountPath(context.Request.Path)
                && context.Response.StatusCode >= 400
            )
                AuthHosting.LogDenied(context, app.Logger);
            if (context.Response.StatusCode >= 400 && !context.Response.HasStarted)
            {
                await ApiErrors
                    .Create(context, context.Response.StatusCode, "Request failed")
                    .ExecuteResultAsync(new ActionContext { HttpContext = context });
            }
        }
        catch (AccountFailureException exception)
        {
            AuthHosting.LogDenied(context, app.Logger);
            await ApiErrors
                .Create(
                    context,
                    exception.Failure switch
                    {
                        AccountFailure.InvalidInput => 400,
                        AccountFailure.Unauthenticated => 401,
                        AccountFailure.Forbidden => 403,
                        AccountFailure.Conflict => 409,
                        AccountFailure.ResourceLimit => 429,
                        _ => 500,
                    },
                    exception.Message,
                    exception.Field is null
                        ? null
                        : new Dictionary<string, List<string>>
                        {
                            [exception.Field] = [exception.Message],
                        }
                )
                .ExecuteResultAsync(new ActionContext { HttpContext = context });
        }
        catch (NpgsqlException exception) when (AuthHosting.IsAccountPath(context.Request.Path))
        {
            ApiLog.RequestFailed(app.Logger, exception);
            await ApiErrors
                .Create(context, 503, "Authentication persistence unavailable")
                .ExecuteResultAsync(new ActionContext { HttpContext = context });
        }
        catch (Exception exception)
            when (!context.Response.HasStarted && !context.RequestAborted.IsCancellationRequested)
        {
            ApiLog.RequestFailed(app.Logger, exception);
            await ApiErrors
                .Create(context, 500, "Unexpected server error")
                .ExecuteResultAsync(new ActionContext { HttpContext = context });
        }
    }
);
app.UseAccountResponseProtection();
app.Use(
    (context, next) =>
        app.Services.GetRequiredService<AccountResourceBudget>().InvokeAsync(context, next)
);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
await app.RunAsync();
return 0;

public partial class Program;
