using Calendar.Api.Models;
using Calendar.Api.Repositories;
using Calendar.Api.Services;
using Xunit;

namespace Calendar.Api.Tests;

public sealed class ServiceTests
{
    [Fact(
        DisplayName = "Given a fixed UTC clock, When a calendar is created, Then both timestamps use one clock reading"
    )]
    public async Task GivenControlledClockWhenCreatingCalendarThenReadsTimeOnceForBothTimestamps()
    {
        // Given a service with a clock fixed to a known UTC instant.
        var clock = new ControlledClock
        {
            Now = DateTimeOffset.Parse(
                "2026-12-01T10:00:00Z",
                System.Globalization.CultureInfo.InvariantCulture
            ),
        };
        var repository = new MemoryRepository();
        var service = new CalendarService(repository, clock);

        // When a calendar is created.
        var calendar = await service.CreateAsync(" First ", CancellationToken.None);

        // Then both timestamps use the same single clock reading.
        Assert.Equal(clock.Now, calendar.CreatedAt);
        Assert.Equal(calendar.CreatedAt, calendar.LastModifiedAt);
        Assert.Equal(1, clock.Reads);
    }

    [Fact(
        DisplayName = "Given an existing calendar and an advanced clock, When another calendar is created, Then it has a new ID and the later timestamp"
    )]
    public async Task GivenLaterClockTimeWhenCreatingAnotherCalendarThenUsesNewTimeAndUniqueId()
    {
        // Given a calendar created before the clock advances.
        var clock = new ControlledClock();
        var service = new CalendarService(new MemoryRepository(), clock);
        var first = await service.CreateAsync("First", CancellationToken.None);
        clock.Now = clock.Now.AddMinutes(10);

        // When another calendar is created with the same title.
        var second = await service.CreateAsync("First", CancellationToken.None);

        // Then its ID is distinct and its timestamp reflects the advanced clock.
        Assert.Equal(clock.Now, second.CreatedAt);
        Assert.NotEqual(first.Id, second.Id);
        Assert.Equal(2, clock.Reads);
    }

    [Fact(
        DisplayName = "Given a stored calendar, When it is retrieved by ID, Then the original values are returned without reading the clock again"
    )]
    public async Task GivenStoredCalendarWhenRetrievingByIdThenReturnsOriginalCalendar()
    {
        // Given a calendar stored before the clock advances.
        var clock = new ControlledClock();
        var service = new CalendarService(new MemoryRepository(), clock);
        var stored = await service.CreateAsync("First", CancellationToken.None);
        clock.Now = clock.Now.AddMinutes(10);

        // When that calendar is retrieved.
        var retrieved = await service.GetAsync(stored.Id, CancellationToken.None);

        // Then retrieval returns the stored values without reading the clock again.
        Assert.Equal(stored, retrieved);
        Assert.Equal(1, clock.Reads);
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

        public Task InsertAsync(CalendarModel calendar, CancellationToken cancellationToken)
        {
            calendars.Add(calendar.Id, calendar);
            return Task.CompletedTask;
        }

        public Task<CalendarModel?> GetAsync(Guid id, CancellationToken cancellationToken) =>
            Task.FromResult(calendars.GetValueOrDefault(id));
    }
}
