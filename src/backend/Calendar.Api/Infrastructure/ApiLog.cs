namespace Calendar.Api.Infrastructure;

internal static partial class ApiLog
{
    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "Local development calendar time checks are disabled"
    )]
    public static partial void LocalOpeningBypass(ILogger logger);

    [LoggerMessage(Level = LogLevel.Error, Message = "Request failed")]
    public static partial void RequestFailed(ILogger logger, Exception exception);

    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "Request completed with status {StatusCode}"
    )]
    public static partial void RequestCompleted(ILogger logger, int statusCode);
}
