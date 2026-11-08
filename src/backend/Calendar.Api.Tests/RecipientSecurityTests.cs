using System.Net;
using System.Net.Http.Json;
using Calendar.Api.Generated;
using Calendar.Api.Services;
using Calendar.Security;
using Dapper;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class RecipientSecurityTests(ApiFixture fixture)
{
    [Theory(
        DisplayName = "Given excluded role or invalid recipient authority, When direct recipient endpoints are called, Then content and image metadata remain protected"
    )]
    [InlineData("anonymous", 401)]
    [InlineData("calendarAdmin", 403)]
    [InlineData("superadmin", 403)]
    [InlineData("other-recipient", 404)]
    [InlineData("disabled", 401)]
    [InlineData("revoked", 401)]
    [InlineData("restricted", 403)]
    public async Task DeniesExcludedAuthority(string scenario, int expected)
    {
        // Given protected populated content and a caller outside the allowed authority.
        await using var context = await RecipientTestContext.CreateAsync(fixture);
        await context.PopulateAsync(image: true);
        var account = context.Calendar.Recipient;
        if (scenario is "calendarAdmin" or "superadmin")
            account = await context.Auth.ProvisionAsync(scenario);
        if (scenario == "other-recipient")
            account = await context.Auth.ProvisionAsync(
                AccountRoles.User,
                context.Calendar.Owner.Id
            );
        using var client = context.Auth.Application.CreateClient();
        if (scenario != "anonymous")
            await context.Auth.LoginAsync(account, client);
        if (scenario == "disabled")
            await context.Auth.ExecuteAsync(
                "UPDATE accounts SET enabled = false WHERE id = @Id",
                new { account.Id }
            );
        if (scenario == "revoked")
            await context.Auth.ExecuteAsync(
                "UPDATE account_sessions SET revoked = true WHERE account_id = @Id",
                new { account.Id }
            );
        if (scenario == "restricted")
            await context.Auth.ExecuteAsync(
                "UPDATE account_sessions SET is_restricted = true WHERE account_id = @Id",
                new { account.Id }
            );

        // When direct board, image and opening requests bypass browser controls.
        var board = await client.GetAsync(context.Path);
        var image = await client.GetAsync(
            $"{context.Path}/doors/1/image?version={context.ImageVersion}"
        );
        var opened = await SendAsync(client, HttpMethod.Post, context.Path + "/doors/1/open");

        // Then current backend authority protects all responses, including error cache headers.
        foreach (var response in new[] { board, image, opened })
        {
            Assert.Equal((HttpStatusCode)expected, response.StatusCode);
            Assert.True(response.Headers.CacheControl?.NoStore);
            var body = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain("Secret", body, StringComparison.Ordinal);
            Assert.DoesNotContain(context.ImageVersion.ToString(), body, StringComparison.Ordinal);
        }
        Assert.Equal(0, await context.HistoryCountAsync());
    }

    [Fact(
        DisplayName = "Given an authenticated recipient, When opening without CSRF or reading an obsolete image version, Then neither operation creates history"
    )]
    public async Task RequiresCsrfAndCurrentImageVersion()
    {
        // Given authorized available image content.
        await using var context = await RecipientTestContext.CreateAsync(fixture);
        await context.PopulateAsync(image: true);

        // When an opening omits CSRF and image requests use stale or missing versions.
        var opening = await SendAsync(
            context.Client,
            HttpMethod.Post,
            context.Path + "/doors/1/open",
            csrf: false
        );
        var stale = await context.Client.GetAsync(
            $"{context.Path}/doors/1/image?version={Guid.NewGuid()}"
        );
        var missing = await context.Client.GetAsync(context.Path + "/doors/1/image");

        // Then no unsafe opening commits and no image read creates history.
        Assert.Equal(HttpStatusCode.BadRequest, opening.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.True(opening.Headers.CacheControl?.NoStore);
        Assert.Equal(0, await context.HistoryCountAsync());
    }

    [Theory(
        DisplayName = "Given malformed paging or door input, When recipient requests bypass frontend validation, Then bounded contract validation rejects them"
    )]
    [InlineData("?offset=-1")]
    [InlineData("?limit=101")]
    [InlineData("?offset=1000001")]
    [InlineData("/doors/0/open")]
    [InlineData("/doors/25/open")]
    public async Task RejectsInvalidInputs(string suffix)
    {
        // Given an unrestricted assigned recipient.
        await using var context = await RecipientTestContext.CreateAsync(fixture);

        // When invalid paging or numbered doors are requested directly.
        var response = suffix.StartsWith('?')
            ? await context.Client.GetAsync("/recipient/calendars" + suffix)
            : await SendAsync(context.Client, HttpMethod.Post, context.Path + suffix);

        // Then validation fails without recording an opening.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(0, await context.HistoryCountAsync());
    }

    [Theory(
        DisplayName = "Given a queued opening and concurrent security change, When lock 800008 is released, Then current assignment or account validity is rechecked"
    )]
    [InlineData("assignment")]
    [InlineData("account")]
    public async Task RechecksAfterSecurityLock(string scenario)
    {
        // Given a populated assigned calendar and an independent security lock.
        await using var context = await RecipientTestContext.CreateAsync(fixture);
        await context.PopulateAsync();
        var next = await context.Auth.ProvisionAsync(AccountRoles.User, context.Calendar.Owner.Id);
        await using var security = new CalendarSecurityScope(context.Calendar);
        await security.AcquireAsync(context.Calendar.Recipient.Id);
        using var scope = context.Auth.Application.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<IRecipientCalendarService>();

        // When the pending opening follows a committed account or assignment change.
        var pending = service.OpenAsync(
            security.Identity,
            context.Saved.Id,
            1,
            CancellationToken.None
        );
        await security.Connection.ExecuteAsync(
            scenario == "account"
                ? "UPDATE accounts SET enabled = false WHERE id = @Id"
                : "UPDATE calendars SET recipient_id = @Next WHERE id = @Calendar",
            new
            {
                Id = context.Calendar.Recipient.Id,
                Next = next.Id,
                Calendar = context.Saved.Id,
            },
            security.Transaction
        );
        await security.Transaction.CommitAsync();
        var action = () => pending;

        // Then stale permission cannot create opening history.
        await Assert.ThrowsAsync<AccountFailureException>(action);
        Assert.Equal(0, await context.HistoryCountAsync());
    }
}
