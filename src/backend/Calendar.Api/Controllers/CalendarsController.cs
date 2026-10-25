using Calendar.Api.Generated;
using Calendar.Api.Models;
using Calendar.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace Calendar.Api.Controllers;

[ApiController]
public sealed class CalendarsController(ICalendarService service) : CalendarsControllerBase
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
