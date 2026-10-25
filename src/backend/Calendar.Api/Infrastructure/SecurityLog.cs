namespace Calendar.Api.Infrastructure;

internal static partial class SecurityLog
{
    [LoggerMessage(
        Level = LogLevel.Information,
        Message = "Security operation {Operation}; actor {ActorId}; target {TargetId}; result {Result}"
    )]
    public static partial void Event(
        ILogger logger,
        string operation,
        Guid? actorId,
        Guid? targetId,
        string result
    );
}
