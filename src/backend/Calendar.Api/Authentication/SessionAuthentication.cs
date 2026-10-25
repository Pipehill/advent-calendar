using System.Security.Claims;
using Calendar.Api.Models;
using Calendar.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Calendar.Api.Authentication;

public static class SessionAuthentication
{
    public const string Scheme = CookieAuthenticationDefaults.AuthenticationScheme;
    private const string SessionClaim = "advent-session";

    public static SessionIdentity? ReadIdentity(ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var accountId)
        && Guid.TryParse(principal.FindFirstValue(SessionClaim), out var sessionId)
            ? new SessionIdentity(accountId, sessionId)
            : null;

    public static ClaimsPrincipal Principal(AuthenticatedAccount authentication) =>
        new(
            new ClaimsIdentity(
                [
                    new Claim(ClaimTypes.NameIdentifier, authentication.Account.Id.ToString()),
                    new Claim(ClaimTypes.Name, authentication.Account.UserName),
                    new Claim(ClaimTypes.Role, authentication.Account.Role),
                    new Claim(SessionClaim, authentication.Session.Id.ToString()),
                ],
                Scheme
            )
        );

    public static Task IssueCookieAsync(HttpContext context, AuthenticatedAccount authentication) =>
        context.SignInAsync(
            Scheme,
            Principal(authentication),
            new AuthenticationProperties
            {
                IsPersistent = true,
                AllowRefresh = false,
                IssuedUtc = authentication.Session.CreatedAt,
                ExpiresUtc = authentication.Session.ExpiresAt,
            }
        );
}

public sealed class SessionCookieEvents(ISessionService sessions) : CookieAuthenticationEvents
{
    public override async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        var current = await sessions.ReadAsync(
            SessionAuthentication.ReadIdentity(context.Principal!),
            context.HttpContext.RequestAborted
        );
        if (current is null)
            context.RejectPrincipal();
        else
            context.ReplacePrincipal(SessionAuthentication.Principal(current));
    }

    public override Task RedirectToLogin(RedirectContext<CookieAuthenticationOptions> context)
    {
        context.Response.StatusCode = 401;
        return Task.CompletedTask;
    }

    public override Task RedirectToAccessDenied(
        RedirectContext<CookieAuthenticationOptions> context
    )
    {
        context.Response.StatusCode = 403;
        return Task.CompletedTask;
    }
}
