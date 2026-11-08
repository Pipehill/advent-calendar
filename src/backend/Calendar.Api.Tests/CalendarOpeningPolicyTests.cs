using System.Globalization;
using Calendar.Api.Models;
using Calendar.Api.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Calendar.Api.Tests;

public sealed class CalendarOpeningPolicyTests
{
    [Theory(
        DisplayName = "Given a saved calendar year and backend instant, When availability is calculated, Then the inclusive Oslo schedule is enforced"
    )]
    [InlineData(2026, 1, "2026-11-30T23:59:59Z", "locked")]
    [InlineData(2026, 1, "2026-12-01T05:59:59.9999999Z", "locked")]
    [InlineData(2026, 1, "2026-12-01T06:00:00Z", "available")]
    [InlineData(2026, 1, "2026-12-01T06:00:00.0000001Z", "available")]
    [InlineData(2026, 24, "2026-12-24T05:59:59Z", "locked")]
    [InlineData(2026, 24, "2026-12-24T06:00:00Z", "available")]
    [InlineData(2026, 1, "2027-06-01T00:00:00Z", "available")]
    [InlineData(2027, 1, "2026-12-24T12:00:00Z", "locked")]
    [InlineData(2025, 24, "2026-01-01T00:00:00Z", "available")]
    public void StoredYearAndInclusiveBoundary(
        int year,
        int number,
        string instant,
        string expected
    )
    {
        // Given a populated door and the normal server policy.
        var policy = new CalendarOpeningPolicy(new(false));
        var now = DateTimeOffset.Parse(instant, CultureInfo.InvariantCulture);

        // When its availability is evaluated at one captured instant.
        var state = policy.State(year, new DoorModel(number, "Gift", ""), now);

        // Then the stored year and named Oslo zone determine the result.
        Assert.Equal(expected, state);
        Assert.Equal(TimeSpan.Zero, CalendarOpeningPolicy.OpensAt(year, number).Offset);
    }

    [Theory(
        DisplayName = "Given independent door fields, When local bypass evaluates a future door, Then only populated content is available"
    )]
    [InlineData("", "", false, "empty")]
    [InlineData(" \t", "\r\n\u00a0", false, "empty")]
    [InlineData("Title", "", false, "available")]
    [InlineData("", "Message\n", false, "available")]
    [InlineData("", "", true, "available")]
    [InlineData("Title", "Message", true, "available")]
    public void IndependentContent(string title, string text, bool image, string expected)
    {
        // Given a future door and an explicitly enabled local bypass.
        var policy = new CalendarOpeningPolicy(new(true));
        var door = new DoorModel(
            24,
            title,
            text,
            image ? new(Guid.NewGuid(), "image/png", 2, 1) : null
        );

        // When content availability is evaluated before the calendar year.
        var state = policy.State(2030, door, DateTimeOffset.UnixEpoch);

        // Then whitespace is empty and any independent populated field suffices.
        Assert.Equal(expected, state);
    }

    [Theory(
        DisplayName = "Given a nondevelopment environment, When bypass configuration is enabled, Then validation rejects it before startup"
    )]
    [InlineData("Production")]
    [InlineData("Staging")]
    [InlineData("Testing")]
    public void RejectNondevelopmentOverride(string environment)
    {
        // Given startup configuration and an explicit nonlocal host environment.
        var builder = WebApplication.CreateBuilder(
            new WebApplicationOptions { EnvironmentName = environment }
        );
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(
                new Dictionary<string, string?> { ["CalendarOpening:DisableTimeCheck"] = "true" }
            )
            .Build();

        // When the option is read by startup.
        var read = () => CalendarOpeningOptions.Read(configuration, builder.Environment);

        // Then startup fails before any service or database work is possible.
        Assert.Throws<InvalidOperationException>(read);
    }
}
