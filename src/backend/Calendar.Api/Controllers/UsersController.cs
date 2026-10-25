using Calendar.Api.Authentication;
using Calendar.Api.Generated;
using Calendar.Api.Services;
using Calendar.Security;
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
[RequestSizeLimit(16384)]
public sealed class UsersController(IUserAdministrationService administration) : UsersControllerBase
{
    public override async Task<ActionResult<UserDto>> CreateUser(CreateUserRequest body)
    {
        var account = await administration.CreateAsync(
            SessionAuthentication.ReadIdentity(User),
            body.Username,
            body.Name,
            body.Password,
            body.Role == CreateUserRequestRole.CalendarAdmin
                ? AccountRoles.Administrator
                : AccountRoles.User,
            body.ResponsibleAdministratorId,
            HttpContext.RequestAborted
        );
        // There is no public per-account lookup endpoint; do not advertise one.
        return StatusCode(201, AuthController.ToUserDto(account));
    }

    public override async Task<ActionResult<UserListDto>> ListUsers(
        int? offset = 0,
        int? limit = 50
    )
    {
        var users = await administration.ListAsync(
            SessionAuthentication.ReadIdentity(User),
            offset ?? 0,
            limit ?? 50,
            HttpContext.RequestAborted
        );
        return Ok(new UserListDto { Users = users.Select(AuthController.ToUserDto).ToList() });
    }

    public override async Task<IActionResult> ResetPassword(ResetPasswordRequest body, Guid id)
    {
        await administration.ResetPasswordAsync(
            SessionAuthentication.ReadIdentity(User),
            id,
            body.Password,
            HttpContext.RequestAborted
        );
        return NoContent();
    }

    public override async Task<IActionResult> ChangeStatus(ChangeStatusRequest body, Guid id)
    {
        await administration.ChangeStatusAsync(
            SessionAuthentication.ReadIdentity(User),
            id,
            body.Enabled,
            HttpContext.RequestAborted
        );
        return NoContent();
    }

    public override async Task<IActionResult> ChangeRole(ChangeRoleRequest body, Guid id)
    {
        await administration.ChangeRoleAsync(
            SessionAuthentication.ReadIdentity(User),
            id,
            body.Role == ChangeRoleRequestRole.CalendarAdmin
                ? AccountRoles.Administrator
                : AccountRoles.User,
            body.TemporaryPassword,
            body.ResponsibleAdministratorId,
            HttpContext.RequestAborted
        );
        return NoContent();
    }
}
