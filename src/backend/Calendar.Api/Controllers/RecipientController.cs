using Calendar.Api.Authentication;
using Calendar.Api.Generated;
using Calendar.Api.Models;
using Calendar.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;

namespace Calendar.Api.Controllers;

[ApiController, Authorize, AutoValidateAntiforgeryToken]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None), OutputCache(NoStore = true)]
[RequestSizeLimit(131072)]
public sealed class RecipientController(IRecipientCalendarService service) : RecipientControllerBase
{
    private SessionIdentity? Identity => SessionAuthentication.ReadIdentity(User);

    public override async Task<ActionResult<RecipientCalendarListDto>> ListRecipientCalendars(
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
            new RecipientCalendarListDto
            {
                TotalCount = page.TotalCount,
                Calendars = page
                    .Calendars.Select(calendar => new RecipientCalendarSummaryDto
                    {
                        Id = calendar.Id,
                        Title = calendar.Title,
                        Year = calendar.Year,
                        Background = Enum.Parse<RecipientCalendarSummaryDtoBackground>(
                            calendar.Background,
                            true
                        ),
                    })
                    .ToList(),
            }
        );
    }

    public override async Task<ActionResult<RecipientCalendarDto>> GetRecipientCalendar(Guid id)
    {
        var calendar = await service.GetAsync(Identity, id, HttpContext.RequestAborted);
        return Ok(
            new RecipientCalendarDto
            {
                Id = calendar.Id,
                Title = calendar.Title,
                Year = calendar.Year,
                Background = Enum.Parse<RecipientCalendarDtoBackground>(calendar.Background, true),
                Layout = Enum.Parse<RecipientCalendarDtoLayout>(calendar.Layout, true),
                DoorOrder = calendar.DoorOrder.ToList(),
                LastModifiedAt = calendar.LastModifiedAt,
                ServerTime = calendar.ServerTime,
                NextOpeningAt = calendar.NextOpeningAt,
                Doors = calendar
                    .Doors.Select(door => new RecipientDoorDto
                    {
                        Number = door.Number,
                        Date = door.Date,
                        OpensAt = door.OpensAt,
                        State = Enum.Parse<RecipientDoorDtoState>(door.State, true),
                        OpenedAt = door.OpenedAt,
                    })
                    .ToList(),
            }
        );
    }

    public override async Task<ActionResult<RecipientOpeningDto>> OpenRecipientDoor(
        Guid id,
        int number
    )
    {
        var result = await service.OpenAsync(Identity, id, number, HttpContext.RequestAborted);
        return Ok(
            new RecipientOpeningDto
            {
                Door = DoorContractMapper.Map(result.Door),
                OpenedAt = result.OpenedAt,
                LastModifiedAt = result.LastModifiedAt,
            }
        );
    }

    public override async Task<ActionResult<DoorImageDto>> GetRecipientDoorImage(
        Guid id,
        int number,
        Guid version
    ) =>
        Ok(
            DoorContractMapper.MapImage(
                await service.ImageAsync(Identity, id, number, version, HttpContext.RequestAborted)
            )
        );
}
