using Calendar.Security;

namespace Calendar.Api.Models;

public sealed class AccountSession
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    public Guid SecurityVersion { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? VerifiedAt { get; set; }
    public bool Restricted { get; set; }
    public bool Revoked { get; set; }
}

public sealed record AuthenticatedAccount(Account Account, AccountSession Session);

public sealed record SessionIdentity(Guid AccountId, Guid SessionId);
