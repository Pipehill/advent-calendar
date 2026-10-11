using Calendar.Api.Models;
using Calendar.Api.Repositories;
using Calendar.Api.Services;
using Xunit;

namespace Calendar.Api.Tests;

public sealed class ServiceTests
{
    [Fact]
    public async Task ControlledTimeAndStoredRetrieval()
    {
        var clock = new ControlledClock
        {
            Now = DateTimeOffset.Parse(
                "2026-12-01T10:00:00Z",
                System.Globalization.CultureInfo.InvariantCulture
            ),
        };
        var repository = new MemoryRepository();
        var service = new CalendarService(repository, clock);
        var first = await service.CreateAsync(" First ", CancellationToken.None);
        Assert.Equal(clock.Now, first.CreatedAt);
        Assert.Equal(first.CreatedAt, first.LastModifiedAt);
        Assert.Equal(1, clock.Reads);
        clock.Now = clock.Now.AddMinutes(10);
        var second = await service.CreateAsync("First", CancellationToken.None);
        Assert.Equal(clock.Now, second.CreatedAt);
        Assert.NotEqual(first.Id, second.Id);
        Assert.Equal(first, await service.GetAsync(first.Id, CancellationToken.None));
        Assert.Equal(2, clock.Reads);
    }

    private sealed class ControlledClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; }
        public int Reads { get; private set; }

        public override DateTimeOffset GetUtcNow()
        {
            Reads++;
            return Now;
        }
    }

    private sealed class MemoryRepository : ICalendarRepository
    {
        private readonly Dictionary<Guid, CalendarModel> calendars = [];

        public Task InsertAsync(
            CalendarModel calendar,
            CancellationToken cancellationToken,
            bool skipExisting = false
        )
        {
            calendars.Add(calendar.Id, calendar);
            return Task.CompletedTask;
        }

        public Task<CalendarModel?> GetAsync(Guid id, CancellationToken cancellationToken) =>
            Task.FromResult(calendars.GetValueOrDefault(id));
    }
}
