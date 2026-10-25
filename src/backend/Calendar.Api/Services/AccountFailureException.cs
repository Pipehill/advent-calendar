namespace Calendar.Api.Services;

public enum AccountFailure
{
    InvalidInput,
    Unauthenticated,
    Forbidden,
    VerificationRequired,
    Conflict,
    ResourceLimit,
}

public sealed class AccountFailureException(
    AccountFailure failure,
    string message,
    string? field = null
) : Exception(message)
{
    public AccountFailure Failure { get; } = failure;
    public string? Field { get; } = field;
}
