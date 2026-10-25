namespace Calendar.Api.Repositories;

// All repositories participating in one security decision share this transaction.
public interface ISecurityTransaction
{
    Task<T> RunAsync<T>(Func<Task<T>> operation, CancellationToken cancellationToken);
}
