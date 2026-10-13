using Calendar.Api.Generated;
using Calendar.Api.Models;
using Calendar.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Calendar.Api.Controllers;

[ApiController]
public sealed class CalendarsController(ICalendarService service, HealthCheckService health)
    : CalendarsControllerBase
{
    public override async Task<ActionResult<CalendarDto>> Create(CreateCalendarRequest body)
    {
        try
        {
            var calendar = await service.CreateAsync(body.Title, HttpContext.RequestAborted);
            return Created($"/calendars/{calendar.Id:D}", Map(calendar));
        }
        catch (InvalidTitleException exception)
        {
            return ApiErrors.Create(
                HttpContext,
                400,
                "Invalid title",
                new Dictionary<string, List<string>> { ["title"] = [exception.Message] }
            );
        }
    }

    public override async Task<ActionResult<CalendarDto>> Get(Guid id)
    {
        var calendar = await service.GetAsync(id, HttpContext.RequestAborted);
        return calendar is null
            ? ApiErrors.Create(HttpContext, 404, "Calendar not found")
            : Ok(Map(calendar));
    }

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

    private static CalendarDto Map(CalendarModel calendar) =>
        new()
        {
            Id = calendar.Id,
            Title = calendar.Title,
            CreatedAt = calendar.CreatedAt,
            LastModifiedAt = calendar.LastModifiedAt,
            Doors = calendar
                .Doors.Select(door => new DoorDto { Number = door.Number, Text = door.Text })
                .ToList(),
        };
}
