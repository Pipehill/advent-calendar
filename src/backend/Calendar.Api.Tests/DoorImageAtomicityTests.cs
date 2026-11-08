using System.Net;
using System.Net.Http.Json;
using Calendar.Api.Generated;
using Calendar.Api.Models;
using Calendar.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Calendar.Api.Tests;

[Collection("PostgreSQL")]
public sealed class DoorImageAtomicityTests(ApiFixture fixture)
{
    [Theory(
        DisplayName = "Given processing outside the security lock, When authority changes or the request is cancelled, Then the draft cannot commit"
    )]
    [InlineData("revoke")]
    [InlineData("role")]
    [InlineData("owner")]
    [InlineData("cancel")]
    public async Task RechecksAfterProcessing(string change)
    {
        // Given a processor paused after the initial authorization transaction has completed.
        var processor = new PausedImageProcessor();
        await using var context = await CalendarTestContext.CreateAsync(
            fixture,
            services => services.AddSingleton<IDoorImageProcessor>(processor)
        );
        var calendar = await context.CreateCalendarAsync();
        var otherOwner = await context.Auth.ProvisionAsync(
            Calendar.Security.AccountRoles.Administrator
        );
        using var scope = context.Application.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<ICalendarService>();
        var session = await context.Auth.ScalarAsync<Guid>(
            "SELECT id FROM account_sessions WHERE account_id = @Id AND NOT revoked",
            new { context.Owner.Id }
        );
        using var cancellation = new CancellationTokenSource();

        // When processing is in flight, another transaction changes the authority without blocking.
        var save = service.SaveDoorAsync(
            new SessionIdentity(context.Owner.Id, session),
            calendar.Id,
            1,
            "Draft",
            "Changed",
            cancellation.Token,
            "replace",
            "placeholder"
        );
        await processor.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
        if (change == "cancel")
            await cancellation.CancelAsync();
        else
            await context.Auth.ExecuteAsync(
                change switch
                {
                    "role" => "UPDATE accounts SET account_role = 'superadmin' WHERE id = @Owner",
                    "owner" => "UPDATE calendars SET owner_id = @OtherOwner WHERE id = @Id",
                    _ => "UPDATE account_sessions SET revoked = true WHERE account_id = @Owner",
                },
                new
                {
                    Owner = context.Owner.Id,
                    OtherOwner = otherOwner.Id,
                    calendar.Id,
                }
            );
        processor.Continue.SetResult();
        var action = () => save;

        // Then cancellation or current authorization wins and no draft content is persisted.
        if (change == "cancel")
            await Assert.ThrowsAnyAsync<OperationCanceledException>(action);
        else
            await Assert.ThrowsAsync<AccountFailureException>(action);
        Assert.Equal(
            "",
            await context.Auth.ScalarAsync<string>(
                "SELECT content_title FROM doors WHERE calendar_id = @Id AND day_number = 1",
                new { calendar.Id }
            )
        );
        Assert.Equal(
            0,
            await context.Auth.ScalarAsync<int>(
                "SELECT count(*)::int FROM doors WHERE image_data IS NOT NULL"
            )
        );
        Assert.Equal(
            calendar.LastModifiedAt.UtcDateTime,
            await context.Auth.ScalarAsync<DateTime>(
                "SELECT last_modified_at FROM calendars WHERE id = @Id",
                new { calendar.Id }
            )
        );
    }

    [Fact(
        DisplayName = "Given saved image content, When the calendar timestamp write fails, Then the transaction rolls back image and text changes together"
    )]
    public async Task PersistenceFailureRollsBackImageAndText()
    {
        // Given a saved image and a database trigger rejecting the final timestamp write.
        await using var context = await CalendarTestContext.CreateAsync(fixture);
        var calendar = await context.CreateCalendarAsync();
        var path = $"/calendars/{calendar.Id}/doors/1";
        await context.Client.PutAsJsonAsync(
            path,
            new
            {
                title = "Saved",
                text = "Original",
                imageAction = "replace",
                imageData = Convert.ToBase64String(DoorImageFixtures.Create()),
            }
        );
        var before = (
            await context.Client.GetFromJsonAsync<CalendarDto>($"/calendars/{calendar.Id}")
        )!;
        await context.Auth.ExecuteAsync(
            """
            CREATE FUNCTION reject_image_commit() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'Simulated storage failure'; END; $$;
            CREATE TRIGGER reject_image_commit BEFORE UPDATE ON calendars
            FOR EACH ROW EXECUTE FUNCTION reject_image_commit();
            """
        );

        // When an image removal and text change reach persistence.
        var response = await context.Client.PutAsJsonAsync(
            path,
            new
            {
                title = "Unsaved",
                text = "Changed",
                imageAction = "remove",
            }
        );
        var after = (
            await context.Client.GetFromJsonAsync<CalendarDto>($"/calendars/{calendar.Id}")
        )!;

        // Then the earlier door update rolls back with the failed calendar update.
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(before.LastModifiedAt, after.LastModifiedAt);
        Assert.Equal(before.Doors.First().Image!.Version, after.Doors.First().Image!.Version);
        Assert.Equal("Saved", after.Doors.First().Title);
        Assert.Equal("Original", after.Doors.First().Text);
    }

    private sealed class PausedImageProcessor : IDoorImageProcessor
    {
        public TaskCompletionSource Started { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Continue { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async Task<DoorImage> ProcessAsync(string data, CancellationToken cancellationToken)
        {
            Started.SetResult();
            await Continue.Task.WaitAsync(cancellationToken);
            return new DoorImage(DoorImageFixtures.Create(), "image/png", 120, 60, Guid.NewGuid());
        }
    }
}
