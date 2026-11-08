using Calendar.Api.Authentication;
using Calendar.Api.Generated;
using Calendar.Api.Models;
using Calendar.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

namespace Calendar.Api.Controllers;

[
    ApiController,
    Authorize,
    AutoValidateAntiforgeryToken,
    ServiceFilter(typeof(ContractRequestFilter))
]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None), OutputCache(NoStore = true)]
[RequestSizeLimit(131072)]
public sealed class CalendarsController(ICalendarService service) : CalendarsControllerBase
{
    private SessionIdentity? Identity => SessionAuthentication.ReadIdentity(User);

    public override async Task<ActionResult<SystemCalendarListDto>> ListSystemCalendars(
        int? offset = 0,
        int? limit = 20
    )
    {
        var page = await service.ListSystemAsync(
            Identity,
            offset ?? 0,
            limit ?? 20,
            HttpContext.RequestAborted
        );
        return Ok(
            new SystemCalendarListDto
            {
                TotalCount = page.TotalCount,
                Calendars = page
                    .Calendars.Select(calendar => new SystemCalendarSummaryDto
                    {
                        Id = calendar.Id,
                        Title = calendar.Title,
                        Year = calendar.Year,
                        OwnerId = calendar.OwnerId,
                        OwnerName = calendar.OwnerName,
                        OwnerUsername = calendar.OwnerUsername,
                        RecipientId = calendar.RecipientId,
                        RecipientName = calendar.RecipientName,
                        RecipientUsername = calendar.RecipientUsername,
                    })
                    .ToList(),
            }
        );
    }

    public override async Task<ActionResult<CalendarDto>> PreviewSystemCalendar(Guid id) =>
        Ok(Map(await service.PreviewSystemAsync(Identity, id, HttpContext.RequestAborted)));

    public override async Task<ActionResult<CalendarDto>> Create(CreateCalendarRequest body)
    {
        var calendar = await service.CreateAsync(
            Identity,
            body.Title,
            body.RecipientId,
            body.Background.ToString().ToLowerInvariant(),
            HttpContext.RequestAborted
        );
        return Created($"/calendars/{calendar.Id:D}", Map(calendar));
    }

    public override async Task<ActionResult<CalendarDto>> Get(Guid id) =>
        Ok(Map(await service.GetAsync(Identity, id, HttpContext.RequestAborted)));

    public override async Task<ActionResult<DoorImageDto>> GetDoorImage(Guid id, int number) =>
        Ok(
            DoorContractMapper.MapImage(
                await service.ReadDoorImageAsync(
                    Identity,
                    id,
                    number,
                    false,
                    HttpContext.RequestAborted
                )
            )
        );

    public override async Task<ActionResult<DoorImageDto>> PreviewSystemDoorImage(
        Guid id,
        int number
    ) =>
        Ok(
            DoorContractMapper.MapImage(
                await service.ReadDoorImageAsync(
                    Identity,
                    id,
                    number,
                    true,
                    HttpContext.RequestAborted
                )
            )
        );

    [RequestSizeLimit(14_000_000)]
    public override async Task<ActionResult<CalendarDto>> UpdateDoor(
        Guid id,
        int number,
        UpdateDoorRequest body
    ) =>
        Ok(
            Map(
                await service.SaveDoorAsync(
                    Identity,
                    id,
                    number,
                    body.Title,
                    body.Text,
                    HttpContext.RequestAborted,
                    body.ImageAction?.ToString().ToLowerInvariant() ?? "keep",
                    body.ImageData
                )
            )
        );

    public override async Task<ActionResult<CalendarDto>> UpdateLayout(
        Guid id,
        UpdateLayoutRequest body
    ) =>
        Ok(
            Map(
                await service.SaveLayoutAsync(
                    Identity,
                    id,
                    body.Layout.ToString().ToLowerInvariant(),
                    HttpContext.RequestAborted
                )
            )
        );

    public override async Task<ActionResult<CalendarDto>> UpdateRecipient(
        Guid id,
        UpdateRecipientRequest body
    ) =>
        Ok(
            Map(
                await service.SaveRecipientAsync(
                    Identity,
                    id,
                    body.RecipientId,
                    HttpContext.RequestAborted
                )
            )
        );

    public override async Task<ActionResult<CalendarListDto>> ListCalendars(
        int? offset = 0,
        int? limit = 20
    )
    {
        var page = await service.ListAsync(
            Identity,
            offset ?? 0,
            limit ?? 20,
            HttpContext.RequestAborted
        );
        return Ok(
            new CalendarListDto
            {
                TotalCount = page.TotalCount,
                Calendars = page
                    .Calendars.Select(calendar => new CalendarSummaryDto
                    {
                        Id = calendar.Id,
                        Title = calendar.Title,
                        RecipientId = calendar.RecipientId,
                        RecipientName = calendar.RecipientName,
                        RecipientUsername = calendar.RecipientUsername,
                        Year = calendar.Year,
                        Background = Enum.Parse<CalendarSummaryDtoBackground>(
                            calendar.Background,
                            true
                        ),
                        CreatedAt = new DateTimeOffset(calendar.CreatedAt),
                        LastModifiedAt = new DateTimeOffset(calendar.LastModifiedAt),
                    })
                    .ToList(),
            }
        );
    }

    private static CalendarDto Map(CalendarModel calendar) =>
        new()
        {
            Id = calendar.Id,
            Title = calendar.Title,
            CreatedAt = calendar.CreatedAt,
            LastModifiedAt = calendar.LastModifiedAt,
            OwnerId = calendar.OwnerId,
            RecipientId = calendar.RecipientId,
            RecipientName = calendar.RecipientName,
            RecipientUsername = calendar.RecipientUsername,
            Year = calendar.Year,
            Background = Enum.Parse<CalendarDtoBackground>(calendar.Background, true),
            Layout = Enum.Parse<CalendarDtoLayout>(calendar.Layout, true),
            DoorOrder = calendar.DoorOrder.ToList(),
            Doors = calendar.Doors.Select(DoorContractMapper.Map).ToList(),
        };
}
