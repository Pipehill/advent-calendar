using Calendar.Api.Authentication;
using Calendar.Api.Generated;
using Calendar.Api.Models;
using Calendar.Api.Services;
using Calendar.Security;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using AccountAuthentication = Calendar.Api.Services.IAuthenticationService;

namespace Calendar.Api.Controllers;

[ApiController, AutoValidateAntiforgeryToken, ServiceFilter(typeof(ContractRequestFilter))]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None), OutputCache(NoStore = true)]
[RequestSizeLimit(16384)]
public sealed class AuthController(
    AccountAuthentication authentication,
    ISessionService sessions,
    IAntiforgery antiforgery
) : AuthControllerBase
{
    public override Task<ActionResult<CsrfDto>> Csrf()
    {
        var tokens = antiforgery.GetAndStoreTokens(HttpContext);
        return Task.FromResult<ActionResult<CsrfDto>>(
            Ok(new CsrfDto { RequestToken = tokens.RequestToken!, HeaderName = "X-CSRF-TOKEN" })
        );
    }

    public override async Task<ActionResult<SessionDto>> Login(LoginRequest body)
    {
        var current = await authentication.LoginAsync(
            body.Username,
            body.Password,
            HttpContext.RequestAborted
        );
        await SessionAuthentication.IssueCookieAsync(HttpContext, current);
        return Ok(ToSessionDto(current));
    }

    [Authorize]
    public override async Task<IActionResult> Reauthenticate(ReauthenticateRequest body)
    {
        await authentication.ReauthenticateAsync(
            SessionAuthentication.ReadIdentity(User),
            body.Password,
            HttpContext.RequestAborted
        );
        return NoContent();
    }

    [Authorize]
    public override async Task<ActionResult<SessionDto>> Session()
    {
        var current =
            await sessions.ReadAsync(
                SessionAuthentication.ReadIdentity(User),
                HttpContext.RequestAborted
            )
            ?? throw new AccountFailureException(
                AccountFailure.Unauthenticated,
                "Authentication required"
            );
        return Ok(ToSessionDto(current));
    }

    public override async Task<IActionResult> Logout()
    {
        await authentication.LogoutAsync(
            SessionAuthentication.ReadIdentity(User),
            HttpContext.RequestAborted
        );
        await HttpContext.SignOutAsync(SessionAuthentication.Scheme);
        return NoContent();
    }

    [Authorize]
    public override async Task<IActionResult> ChangePassword(ChangePasswordRequest body)
    {
        await authentication.ChangePasswordAsync(
            SessionAuthentication.ReadIdentity(User),
            body.CurrentPassword,
            body.NewPassword,
            HttpContext.RequestAborted
        );
        await HttpContext.SignOutAsync(SessionAuthentication.Scheme);
        return NoContent();
    }

    internal static UserDto ToUserDto(Account user) =>
        new()
        {
            Id = user.Id,
            Username = user.UserName,
            Name = user.Name,
            Role = user.Role switch
            {
                AccountRoles.Superadmin => UserDtoRole.Superadmin,
                AccountRoles.Administrator => UserDtoRole.CalendarAdmin,
                _ => UserDtoRole.CalendarUser,
            },
            Enabled = user.Enabled,
            ResponsibleAdministratorId = user.ResponsibleAdministratorId,
            CreatedById = user.CreatedById,
            CreatedAt = user.CreatedAt,
        };

    private static SessionDto ToSessionDto(AuthenticatedAccount current) =>
        new()
        {
            User = ToUserDto(current.Account),
            ExpiresAt = current.Session.ExpiresAt,
            MustChangePassword = current.Session.Restricted,
        };
}
