namespace Calendar.Security;

public static class AccountRoles
{
    public const string Superadmin = "superadmin";
    public const string Administrator = "calendarAdmin";
    public const string User = "calendarUser";

    public static bool IsAdministrator(string role) => role is Superadmin or Administrator;

    public static bool IsValid(string role) => IsAdministrator(role) || role == User;
}

public sealed class Account
{
    public Guid Id { get; set; }
    public string UserName { get; set; } = "";
    public string Name { get; set; } = "";
    public string NormalizedUserName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = AccountRoles.User;
    public bool Enabled { get; set; } = true;
    public Guid SecurityVersion { get; set; }
    public bool MustChangePassword { get; set; }
    public DateTimeOffset? TemporaryPasswordExpiresAt { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
    public Guid? ResponsibleAdministratorId { get; set; }
    public Guid? CreatedById { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
