using System.Net.Http.Json;
using System.Text.Json;
using Calendar.Api.Generated;
using Calendar.Security;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Calendar.Api.Tests;

internal sealed class CalendarTestContext(
    AuthTestContext auth,
    TestAccount owner,
    TestAccount recipient
) : IAsyncDisposable
{
    public AuthTestContext Auth => auth;
    public TestAccount Owner => owner;
    public TestAccount Recipient => recipient;
    public HttpClient Client => auth.Client;
    public WebApplicationFactory<Program> Application => auth.Application;

    public static async Task<CalendarTestContext> CreateAsync(
        ApiFixture fixture,
        Action<IServiceCollection>? configureServices = null
    )
    {
        var auth = await AuthTestContext.CreateAsync(fixture, configureServices);
        var owner = await auth.ProvisionAsync(AccountRoles.Administrator);
        var recipient = await auth.ProvisionAsync(AccountRoles.User, owner.Id);
        await auth.LoginAsync(owner);
        var csrf = (await auth.Client.GetFromJsonAsync<CsrfDto>("/auth/csrf"))!;
        auth.Client.DefaultRequestHeaders.Add(csrf.HeaderName, csrf.RequestToken);
        return new(auth, owner, recipient);
    }

    public Task<HttpResponseMessage> CreateAsync(object body)
    {
        var fields = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
            JsonSerializer.Serialize(body)
        )!;
        fields["recipientId"] = JsonSerializer.SerializeToElement(recipient.Id);
        fields["background"] = JsonSerializer.SerializeToElement("woodland");
        return Client.PostAsJsonAsync("/calendars", fields);
    }

    public async Task<CalendarDto> CreateCalendarAsync(string title = "Images") =>
        (await (await CreateAsync(new { title })).Content.ReadFromJsonAsync<CalendarDto>())!;

    public ValueTask DisposeAsync() => auth.DisposeAsync();
}
