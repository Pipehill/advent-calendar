using Calendar.Security;

namespace Calendar.Api.Models;

public sealed record AccountPage(IEnumerable<Account> Users, int TotalCount);
