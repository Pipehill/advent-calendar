using Calendar.Api.Models;
using Calendar.Api.Services;
using Dapper;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Calendar.Api.Tests;

// Keep the independent lock and scoped service alive until the queued mutation is observed.
internal sealed class CalendarSecurityScope(CalendarTestContext context) : IAsyncDisposable
{
    private readonly IServiceScope scope = context.Application.Services.CreateScope();
    public NpgsqlConnection Connection { get; } = new(context.Auth.ConnectionString);
    public NpgsqlTransaction Transaction { get; private set; } = null!;
    public SessionIdentity Identity { get; private set; } = null!;
    public ICalendarService Service => scope.ServiceProvider.GetRequiredService<ICalendarService>();

    public async Task AcquireAsync()
    {
        var sessionId = await context.Auth.ScalarAsync<Guid>(
            "SELECT id FROM account_sessions WHERE account_id = @Id AND NOT revoked",
            new { context.Owner.Id }
        );
        Identity = new SessionIdentity(context.Owner.Id, sessionId);
        await Connection.OpenAsync();
        Transaction = await Connection.BeginTransactionAsync();
        await Connection.ExecuteAsync(
            "SELECT pg_advisory_xact_lock(800008)",
            transaction: Transaction
        );
    }

    public async ValueTask DisposeAsync()
    {
        await Connection.DisposeAsync();
        scope.Dispose();
    }
}
