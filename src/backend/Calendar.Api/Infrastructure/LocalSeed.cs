using Calendar.Api.Repositories;
using Calendar.Api.Services;

namespace Calendar.Api.Infrastructure;

public static class LocalSeed
{
    public static readonly Guid CalendarId = Guid.Parse("5ea3a1b2-48aa-4d10-bce0-dc1e01fe2026");

    public static async Task ApplyAsync(
        IServiceProvider provider,
        CancellationToken cancellationToken
    )
    {
        using var scope = provider.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<ICalendarService>();
        var repository = scope.ServiceProvider.GetRequiredService<ICalendarRepository>();
        await repository.InsertAsync(
            service.Initialize("Local advent calendar", CalendarId),
            cancellationToken,
            skipExisting: true
        );
    }
}
