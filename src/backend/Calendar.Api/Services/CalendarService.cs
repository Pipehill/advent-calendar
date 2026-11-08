using System.Text;
using Calendar.Api.Models;
using Calendar.Api.Repositories;
using Calendar.Security;

namespace Calendar.Api.Services;

public sealed class CalendarService(
    ICalendarRepository repository,
    ISecurityTransaction transaction,
    ISessionService sessions,
    IAccountRepository accounts,
    TimeProvider clock
) : ICalendarService
{
    public Task<CalendarModel> CreateAsync(
        SessionIdentity? identity,
        string? title,
        Guid recipientId,
        string background,
        CancellationToken cancellationToken
    ) =>
        transaction.RunAsync(
            async () =>
            {
                var owner = await RequireOwnerAsync(identity);
                var normalized = title?.Trim();
                ValidateText(normalized, 1, 100, "title");
                if (background is not ("woodland" or "sleigh" or "playtime" or "aurora"))
                    throw Invalid("background");
                var recipient = await RequireRecipientAsync(recipientId, owner);
                var now = Now();
                var year = TimeZoneInfo
                    .ConvertTime(now, TimeZoneInfo.FindSystemTimeZoneById("Europe/Oslo"))
                    .Year;
                var calendar = new CalendarModel(
                    Guid.NewGuid(),
                    normalized!,
                    now,
                    now,
                    Enumerable
                        .Range(1, 24)
                        .Select(number => new DoorModel(number, "", ""))
                        .ToArray(),
                    owner,
                    recipientId,
                    year,
                    background,
                    "chronological",
                    Enumerable.Range(1, 24).ToArray(),
                    recipient.Name,
                    recipient.UserName
                );
                await repository.InsertAsync(calendar);
                return calendar;
            },
            cancellationToken
        );

    public Task<CalendarModel> GetAsync(
        SessionIdentity? identity,
        Guid id,
        CancellationToken cancellationToken
    ) => transaction.RunAsync(async () => await FindOwnedAsync(identity, id), cancellationToken);

    public Task<CalendarPage> ListAsync(
        SessionIdentity? identity,
        int offset,
        int limit,
        CancellationToken cancellationToken
    ) =>
        transaction.RunAsync(
            async () =>
            {
                var owner = await RequireOwnerAsync(identity);
                if (offset is < 0 or > 1000000 || limit is < 1 or > 100)
                    throw Invalid("offset");
                return await repository.ListAsync(owner, offset, limit);
            },
            cancellationToken
        );

    public Task<CalendarModel> SaveDoorAsync(
        SessionIdentity? identity,
        Guid id,
        int number,
        string? title,
        string? text,
        CancellationToken cancellationToken
    ) =>
        transaction.RunAsync(
            async () =>
            {
                var calendar = await FindOwnedAsync(identity, id);
                if (number is < 1 or > 24)
                    throw Invalid("number");
                ValidateText(title, 0, 50, "title");
                ValidateText(text, 0, 5000, "text");
                await repository.SaveDoorAsync(id, number, title!, text!, Now());
                return (await repository.GetAsync(id, calendar.OwnerId))!;
            },
            cancellationToken
        );

    public Task<CalendarModel> SaveLayoutAsync(
        SessionIdentity? identity,
        Guid id,
        string layout,
        CancellationToken cancellationToken
    ) =>
        transaction.RunAsync(
            async () =>
            {
                var calendar = await FindOwnedAsync(identity, id);
                if (layout is not ("chronological" or "random"))
                    throw Invalid("layout");
                var order = Enumerable.Range(1, 24).ToArray();
                if (layout == "random")
                    Random.Shared.Shuffle(order);
                await repository.SaveLayoutAsync(id, layout, order, Now());
                return (await repository.GetAsync(id, calendar.OwnerId))!;
            },
            cancellationToken
        );

    public Task<CalendarModel> SaveRecipientAsync(
        SessionIdentity? identity,
        Guid id,
        Guid recipientId,
        CancellationToken cancellationToken
    ) =>
        transaction.RunAsync(
            async () =>
            {
                var calendar = await FindOwnedAsync(identity, id);
                await RequireRecipientAsync(recipientId, calendar.OwnerId);
                await repository.SaveRecipientAsync(id, recipientId, Now());
                return (await repository.GetAsync(id, calendar.OwnerId))!;
            },
            cancellationToken
        );

    private async Task<Account> RequireRecipientAsync(Guid recipientId, Guid ownerId)
    {
        var recipient = await accounts.FindByIdAsync(recipientId);
        if (
            recipient is null
            || recipient.Role != AccountRoles.User
            || recipient.ResponsibleAdministratorId != ownerId
        )
            throw Invalid("recipientId");
        return recipient;
    }

    private async Task<Guid> RequireOwnerAsync(SessionIdentity? identity)
    {
        var actor = await sessions.RequireAsync(identity);
        if (actor.Account.Role != AccountRoles.Administrator)
            throw new AccountFailureException(
                AccountFailure.Forbidden,
                "Calendar administrator required"
            );
        return actor.Account.Id;
    }

    private async Task<CalendarModel> FindOwnedAsync(SessionIdentity? identity, Guid id)
    {
        var owner = await RequireOwnerAsync(identity);
        return await repository.GetAsync(id, owner)
            ?? throw new AccountFailureException(AccountFailure.NotFound, "Calendar not found");
    }

    private DateTimeOffset Now()
    {
        var instant = clock.GetUtcNow();
        return new DateTimeOffset(instant.UtcTicks - instant.UtcTicks % 10, TimeSpan.Zero);
    }

    internal static void ValidateText(string? value, int minimum, int maximum, string field)
    {
        if (
            value is null
            || !AccountPasswordValidator.HasValidEncoding(value)
            || value.Contains('\0')
        )
            throw Invalid(field);
        var count = value.EnumerateRunes().Count();
        if (count < minimum || count > maximum)
            throw Invalid(field);
    }

    private static AccountFailureException Invalid(string field) =>
        new(AccountFailure.InvalidInput, "Invalid calendar input", field);
}
