using System.Net;
using System.Net.Http.Json;
using Calendar.Api.Generated;
using Calendar.Security;
using Xunit;
using static Calendar.Api.Tests.AuthTestContext;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class RecipientListTests(ApiFixture fixture)
{
    [Fact(
        DisplayName = "Given several assigned calendars and another recipient, When bounded pages are read, Then only current assignments and safe navigation fields are returned"
    )]
    public async Task ListsOnlyAssignmentsWithStablePagination()
    {
        // Given three assigned calendars and one calendar assigned to someone else.
        await using var context = await RecipientTestContext.CreateAsync(fixture);
        using var owner = await context.Auth.CreateAuthenticatedClientAsync(context.Calendar.Owner);
        var other = await context.Auth.ProvisionAsync(AccountRoles.User, context.Calendar.Owner.Id);
        foreach (
            var recipientId in new[]
            {
                context.Calendar.Recipient.Id,
                other.Id,
                context.Calendar.Recipient.Id,
            }
        )
            await SendAsync(
                owner,
                HttpMethod.Post,
                "/calendars",
                new
                {
                    title = "Another calendar",
                    recipientId,
                    background = "aurora",
                }
            );
        await context.PopulateAsync(image: true);

        // When two scoped pages and an out-of-range empty page are read.
        var first = (
            await context.Client.GetFromJsonAsync<RecipientCalendarListDto>(
                "/recipient/calendars?offset=0&limit=2"
            )
        )!;
        var second = (
            await context.Client.GetFromJsonAsync<RecipientCalendarListDto>(
                "/recipient/calendars?offset=2&limit=2"
            )
        )!;
        var empty = (
            await context.Client.GetFromJsonAsync<RecipientCalendarListDto>(
                "/recipient/calendars?offset=100&limit=2"
            )
        )!;
        var image = await context.Client.GetAsync(
            $"{context.Path}/doors/1/image?version={context.ImageVersion}"
        );

        // Then pagination never exposes unrelated identities, and authorized image reads do not mark doors opened.
        Assert.Equal(3, first.TotalCount);
        Assert.Equal(2, first.Calendars.Count);
        Assert.Single(second.Calendars);
        Assert.Empty(
            first
                .Calendars.Select(item => item.Id)
                .Intersect(second.Calendars.Select(item => item.Id))
        );
        Assert.Empty(empty.Calendars);
        Assert.Equal(3, empty.TotalCount);
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal(0, await context.HistoryCountAsync());
    }
}
