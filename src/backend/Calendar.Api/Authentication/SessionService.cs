using System.Security.Claims;
using Calendar.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Calendar.Api.Authentication;

public sealed class SessionService(AuthDatabase database, TimeProvider time)
{
    public const string Scheme = CookieAuthenticationDefaults.AuthenticationScheme;
    public const string SessionClaim = "advent-session";

    public Task<AuthenticatedAccount?> ReadAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken
    ) => database.RunAsync(() => ReadInTransactionAsync(principal), cancellationToken);

    public async Task<AuthenticatedAccount?> ReadInTransactionAsync(ClaimsPrincipal principal)
    {
        if (
            !Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var accountId)
            || !Guid.TryParse(principal.FindFirstValue(SessionClaim), out var sessionId)
        )
            return null;
        var account = await database.FindAsync("id = @Id", new { Id = accountId });
        var session = (
            await database.QueryAsync<AccountSession>(
                """
                SELECT id, account_id AS AccountId, security_version AS SecurityVersion,
                    created_at AS CreatedAt, expires_at AS ExpiresAt, verified_at AS VerifiedAt,
                    is_restricted AS Restricted, revoked FROM account_sessions WHERE id = @Id AND account_id = @AccountId
                """,
                new { Id = sessionId, AccountId = accountId }
            )
        ).SingleOrDefault();
        var now = time.GetUtcNow();
        if (
            account is null
            || session is null
            || !account.Enabled
            || session.Revoked
            || session.SecurityVersion != account.SecurityVersion
            || session.ExpiresAt <= now
            || (
                account.MustChangePassword
                && (account.TemporaryPasswordExpiresAt <= now || !session.Restricted)
            )
        )
            return null;
        return new(account, session);
    }

    public async Task<AuthenticatedAccount> RequireAsync(
        ClaimsPrincipal principal,
        bool administrator = false,
        bool recent = false,
        bool unrestricted = true
    )
    {
        var actor =
            await ReadInTransactionAsync(principal)
            ?? throw new AuthFailureException(401, "Authentication required");
        if (
            (unrestricted && actor.Session.Restricted)
            || (administrator && !AccountRoles.IsAdministrator(actor.Account.Role))
        )
            throw new AuthFailureException(403, "Operation is not permitted");
        if (
            recent
            && (
                actor.Session.VerifiedAt is null
                || actor.Session.VerifiedAt.Value.AddMinutes(5) <= time.GetUtcNow()
            )
        )
            throw new AuthFailureException(
                403,
                "Recent administrator password verification required"
            );
        return actor;
    }

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

public sealed class SessionCookieEvents(SessionService sessions) : CookieAuthenticationEvents
{
    public override async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        var current = await sessions.ReadAsync(
            context.Principal!,
            context.HttpContext.RequestAborted
        );
        if (current is null)
            context.RejectPrincipal();
        else
            context.ReplacePrincipal(SessionService.Principal(current));
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
