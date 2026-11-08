using Calendar.Api.Models;
using Calendar.Api.Repositories;
using Calendar.Security;

namespace Calendar.Api.Services;

public sealed class RecipientCalendarService(
    ICalendarRepository calendars,
    IRecipientCalendarRepository recipients,
    ISecurityTransaction transaction,
    ISessionService sessions,
    CalendarOpeningPolicy opening,
    TimeProvider clock
) : IRecipientCalendarService
{
    public Task<RecipientCalendarPage> ListAsync(
        SessionIdentity? identity,
        int offset,
        int limit,
        CancellationToken cancellationToken
    ) =>
        transaction.RunAsync(
            async () =>
            {
                var recipient = await RequireRecipientAsync(identity);
                if (offset is < 0 or > 1000000 || limit is < 1 or > 100)
                    throw new AccountFailureException(
                        AccountFailure.InvalidInput,
                        "Invalid pagination"
                    );
                return await recipients.ListAsync(recipient, offset, limit);
            },
            cancellationToken
        );

    public Task<RecipientCalendar> GetAsync(
        SessionIdentity? identity,
        Guid id,
        CancellationToken cancellationToken
    ) =>
        transaction.RunAsync(
            async () =>
            {
                var recipient = await RequireRecipientAsync(identity);
                var calendar = await FindAssignedAsync(id, recipient);
                var history = await recipients.HistoryAsync(id, recipient);
                var now = clock.GetUtcNow();
                var doors = calendar
                    .Doors.Select(door => new RecipientDoor(
                        door.Number,
                        new DateOnly(calendar.Year, 12, door.Number),
                        CalendarOpeningPolicy.OpensAt(calendar.Year, door.Number),
                        opening.State(calendar.Year, door, now),
                        history.TryGetValue(door.Number, out var first) ? first : null
                    ))
                    .ToArray();
                var next = doors
                    .Where(door => door.State == "locked")
                    .Select(door => (DateTimeOffset?)door.OpensAt)
                    .Min();
                return new RecipientCalendar(
                    calendar.Id,
                    calendar.Title,
                    calendar.Year,
                    calendar.Background,
                    calendar.Layout,
                    calendar.DoorOrder,
                    calendar.LastModifiedAt,
                    now,
                    next,
                    doors
                );
            },
            cancellationToken
        );

    public Task<RecipientOpening> OpenAsync(
        SessionIdentity? identity,
        Guid id,
        int number,
        CancellationToken cancellationToken
    ) =>
        transaction.RunAsync(
            async () =>
            {
                var recipient = await RequireRecipientAsync(identity);
                var calendar = await FindAssignedAsync(id, recipient);
                var now = clock.GetUtcNow();
                var door = RequireAvailable(calendar, number, now);
                var first = await recipients.RecordAsync(id, recipient, number, now);
                return new RecipientOpening(door, first, calendar.LastModifiedAt);
            },
            cancellationToken
        );

    public Task<DoorImage> ImageAsync(
        SessionIdentity? identity,
        Guid id,
        int number,
        Guid version,
        CancellationToken cancellationToken
    ) =>
        transaction.RunAsync(
            async () =>
            {
                var recipient = await RequireRecipientAsync(identity);
                var calendar = await FindAssignedAsync(id, recipient);
                if (version == Guid.Empty)
                    throw new AccountFailureException(
                        AccountFailure.InvalidInput,
                        "Image version required",
                        "version"
                    );
                var door = RequireAvailable(calendar, number, clock.GetUtcNow());
                if (door.Image is null)
                    throw new AccountFailureException(AccountFailure.NotFound, "Image not found");
                if (door.Image.Version != version)
                    throw new AccountFailureException(AccountFailure.Conflict, "Image changed");
                return await calendars.GetDoorImageAsync(id, number)
                    ?? throw new AccountFailureException(
                        AccountFailure.NotFound,
                        "Image not found"
                    );
            },
            cancellationToken
        );

    private async Task<Guid> RequireRecipientAsync(SessionIdentity? identity)
    {
        var actor = await sessions.RequireAsync(identity);
        if (actor.Account.Role != AccountRoles.User)
            throw new AccountFailureException(AccountFailure.Forbidden, "Calendar user required");
        return actor.Account.Id;
    }

    private async Task<CalendarModel> FindAssignedAsync(Guid id, Guid recipient) =>
        await calendars.GetForRecipientAsync(id, recipient)
        ?? throw new AccountFailureException(AccountFailure.NotFound, "Calendar not found");

    private DoorModel RequireAvailable(CalendarModel calendar, int number, DateTimeOffset now)
    {
        if (number is < 1 or > 24)
            throw new AccountFailureException(
                AccountFailure.InvalidInput,
                "Invalid door number",
                "number"
            );
        var door = calendar.Doors.Single(door => door.Number == number);
        if (opening.State(calendar.Year, door, now) != "available")
            throw new AccountFailureException(AccountFailure.Conflict, "Door unavailable");
        return door;
    }
}
