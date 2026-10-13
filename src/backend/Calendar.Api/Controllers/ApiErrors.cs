using System.Diagnostics;
using Calendar.Api.Generated;
using Microsoft.AspNetCore.Mvc;

namespace Calendar.Api.Controllers;

public static class ApiErrors
{
    public static ObjectResult Create(
        HttpContext context,
        int status,
        string title,
        IDictionary<string, List<string>>? errors = null
    )
    {
        var result = new ObjectResult(
            new ApiProblemDetails
            {
                Type = $"https://httpstatuses.io/{status}",
                Title = title,
                Status = status,
                TraceId = Activity.Current?.TraceId.ToString() ?? context.TraceIdentifier,
                Errors = errors ?? new Dictionary<string, List<string>>(),
            }
        )
        {
            StatusCode = status,
        };
        result.ContentTypes.Add("application/problem+json");
        return result;
    }
}
