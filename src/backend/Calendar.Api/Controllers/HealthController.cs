using Calendar.Api.Generated;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Calendar.Api.Controllers;

[ApiController]
public sealed class HealthController(HealthCheckService health) : HealthControllerBase
{
    public override Task<ActionResult<string>> Live() =>
        Task.FromResult<ActionResult<string>>(Content("Healthy", "text/plain"));

    public override async Task<ActionResult<string>> Ready()
    {
        var result = await health.CheckHealthAsync(HttpContext.RequestAborted);
        return new ContentResult
        {
            Content = result.Status == HealthStatus.Healthy ? "Healthy" : "Unhealthy",
            ContentType = "text/plain",
            StatusCode = result.Status == HealthStatus.Healthy ? 200 : 503,
        };
    }
}
