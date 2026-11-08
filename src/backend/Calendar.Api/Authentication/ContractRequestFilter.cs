using System.Text;
using System.Text.Json;
using Calendar.Api.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Calendar.Api.Authentication;

// Validate presence/null/enum values before MVC loses the distinction between a
// missing value-type field and its CLR default. The authored schema owns this
// validation; generated models/controllers remain untouched.
public sealed class ContractRequestFilter : IAsyncResourceFilter
{
    private static readonly JsonDocument Contract = LoadContract();

    public async Task OnResourceExecutionAsync(
        ResourceExecutingContext context,
        ResourceExecutionDelegate next
    )
    {
        var requestType = context
            .ActionDescriptor.Parameters.Select(parameter => parameter.ParameterType)
            .FirstOrDefault(type =>
                type.Namespace == "Calendar.Api.Generated"
                && type.Name.EndsWith("Request", StringComparison.Ordinal)
            );
        if (requestType is null)
        {
            await next();
            return;
        }
        var request = context.HttpContext.Request;
        if (!request.HasJsonContentType())
        {
            await next();
            return;
        }
        var maximumBody = requestType.Name == "UpdateDoorRequest" ? 14_000_000 : 131072;
        if (request.ContentLength > maximumBody)
        {
            context.Result = ApiErrors.Create(context.HttpContext, 413, "Request too large");
            return;
        }
        request.EnableBuffering(bufferThreshold: 65536, bufferLimit: maximumBody);
        try
        {
            using var body = await JsonDocument.ParseAsync(
                request.Body,
                cancellationToken: context.HttpContext.RequestAborted
            );
            var schema = Contract
                .RootElement.GetProperty("components")
                .GetProperty("schemas")
                .GetProperty(requestType.Name);
            var error = Validate(body.RootElement, schema);
            if (error is not null)
            {
                var tooLarge =
                    error == "imageData"
                    && body.RootElement.TryGetProperty("imageData", out var image)
                    && image.ValueKind == JsonValueKind.String
                    && image.GetString()!.Length > 13_333_336;
                context.Result = ApiErrors.Create(
                    context.HttpContext,
                    tooLarge ? 413 : 400,
                    "Invalid request",
                    new Dictionary<string, List<string>>
                    {
                        [error] = ["A required value is missing, null or invalid."],
                    }
                );
                return;
            }
        }
        catch (IOException)
        {
            context.Result = ApiErrors.Create(context.HttpContext, 413, "Request too large");
            return;
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException)
        {
            context.Result = ApiErrors.Create(context.HttpContext, 400, "Invalid JSON request");
            return;
        }
        finally
        {
            request.Body.Position = 0;
        }
        await next();
    }

    private static string? Validate(JsonElement body, JsonElement schema)
    {
        if (body.ValueKind != JsonValueKind.Object)
            return "body";
        foreach (var required in schema.GetProperty("required").EnumerateArray())
            if (!body.TryGetProperty(required.GetString()!, out _))
                return required.GetString();
        var properties = schema.GetProperty("properties");
        foreach (var property in body.EnumerateObject())
        {
            if (
                !properties.TryGetProperty(property.Name, out var field)
                || property.Value.ValueKind == JsonValueKind.Null
            )
                return property.Name;
            if (
                field.TryGetProperty("enum", out var values)
                && (
                    property.Value.ValueKind != JsonValueKind.String
                    || !values
                        .EnumerateArray()
                        .Any(value => value.GetString() == property.Value.GetString())
                )
            )
                return property.Name;
            if (
                field.TryGetProperty("maxLength", out var maximum)
                && property.Value.ValueKind == JsonValueKind.String
                && property.Value.GetString()!.EnumerateRunes().Count() > maximum.GetInt32()
            )
                return property.Name;
        }
        return null;
    }

    private static JsonDocument LoadContract()
    {
        using var stream = typeof(ContractRequestFilter).Assembly.GetManifestResourceStream(
            "AccountOpenApi.json"
        )!;
        return JsonDocument.Parse(stream);
    }
}
