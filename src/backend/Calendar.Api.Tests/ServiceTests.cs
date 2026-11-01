using System.Globalization;
using System.Net.Http.Json;
using Calendar.Api.Generated;
using Xunit;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class ServiceTests(ApiFixture fixture)
{
    [Theory(
        DisplayName = "Given UTC instants around Oslo New Year, When calendars are created, Then the stored year follows Europe Oslo and reads preserve it"
    )]
    [InlineData("2026-12-31T22:59:59Z", 2026)]
    [InlineData("2026-12-31T23:00:00Z", 2027)]
    public async Task GivenYearBoundaryWhenCreatingThenPersistsOsloYear(string instant, int year)
    {
        // Given an authenticated owner and a controlled clock near Oslo New Year.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        context.Auth.Time.Advance(
            DateTimeOffset.Parse(instant, CultureInfo.InvariantCulture)
                - context.Auth.Time.GetUtcNow()
        );
        await context.Auth.LoginAsync(context.Owner);
        var csrf = (await context.Client.GetFromJsonAsync<CsrfDto>("/auth/csrf"))!;
        context.Client.DefaultRequestHeaders.Remove(csrf.HeaderName);
        context.Client.DefaultRequestHeaders.Add(csrf.HeaderName, csrf.RequestToken);

        // When two calendars are created and one is read after the clock advances.
        var response = await context.CreateAsync(new { title = " First " });
        var first = (await response.Content.ReadFromJsonAsync<CalendarDto>())!;
        context.Auth.Time.Advance(TimeSpan.FromMinutes(10));
        var second = (
            await (
                await context.CreateAsync(new { title = "First" })
            ).Content.ReadFromJsonAsync<CalendarDto>()
        )!;
        var retrieved = (
            await context.Client.GetFromJsonAsync<CalendarDto>($"/calendars/{first.Id}")
        )!;

        // Then timestamps, title, UUID and stored business year retain their semantics.
        Assert.Equal(year, first.Year);
        Assert.Equal(first.CreatedAt, first.LastModifiedAt);
        Assert.Equal("First", first.Title);
        Assert.NotEqual(first.Id, second.Id);
        Assert.Equal(context.Auth.Time.GetUtcNow(), second.CreatedAt);
        Assert.Equal(first.CreatedAt, retrieved.CreatedAt);
        Assert.Equal(year, retrieved.Year);
    }
}
