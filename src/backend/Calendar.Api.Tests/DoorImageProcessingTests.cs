using Calendar.Api.Services;
using SkiaSharp;
using Xunit;

namespace Calendar.Api.Tests;

public sealed class DoorImageProcessingTests
{
    [Theory(
        DisplayName = "Given a detailed supported image over one MB, When processed, Then decodable output fits the storage limit and preserves format"
    )]
    [InlineData(SKEncodedImageFormat.Png, "image/png")]
    [InlineData(SKEncodedImageFormat.Jpeg, "image/jpeg")]
    public async Task AdaptsDetailedImages(SKEncodedImageFormat format, string mediaType)
    {
        // Given detailed pixels whose encoded source exceeds the persisted limit.
        using var processor = new DoorImageProcessor();
        var source = DoorImageFixtures.Create(format, 1600, 1000, noise: true);

        // When the actual native codec adapts the source.
        var result = await processor.ProcessAsync(
            Convert.ToBase64String(source),
            CancellationToken.None
        );
        using var decoded = SKBitmap.Decode(result.Data);

        // Then bytes, detected format, aspect ratio and PNG transparency survive adaptation.
        Assert.True(source.Length > 1_000_000);
        Assert.InRange(result.Data.Length, 1, 1_000_000);
        Assert.Equal(mediaType, result.MediaType);
        Assert.Equal(result.Width, decoded.Width);
        Assert.Equal(result.Height, decoded.Height);
        Assert.InRange((double)decoded.Width / decoded.Height, 1.59, 1.61);
        if (format == SKEncodedImageFormat.Png)
            Assert.InRange(decoded.GetPixel(0, 0).Alpha, (byte)126, (byte)130);
    }

    [Theory(
        DisplayName = "Given malformed or unsupported image data, When processed, Then validation rejects it without output"
    )]
    [InlineData("base64")]
    [InlineData("empty")]
    [InlineData("truncated-png")]
    [InlineData("truncated-jpeg")]
    [InlineData("webp")]
    [InlineData("gif")]
    [InlineData("svg")]
    [InlineData("side")]
    public async Task RejectsInvalidImages(string scenario)
    {
        // Given data independent of any supplied filename or MIME declaration.
        using var processor = new DoorImageProcessor();
        var source = scenario switch
        {
            "truncated-png" => DoorImageFixtures.Create()[..^8],
            "truncated-jpeg" => DoorImageFixtures.Create(SKEncodedImageFormat.Jpeg)[..^2],
            "webp" => DoorImageFixtures.Create(SKEncodedImageFormat.Webp),
            "gif" => "GIF89a"u8.ToArray(),
            "svg" => "<svg xmlns='http://www.w3.org/2000/svg'/>"u8.ToArray(),
            "side" => DoorImageFixtures.Create(width: 10001, height: 1),
            _ => [],
        };
        var input = scenario == "base64" ? "%%%" : Convert.ToBase64String(source);

        // When image processing is requested.
        var action = () => processor.ProcessAsync(input, CancellationToken.None);

        // Then failures are structured image field errors.
        var error = await Assert.ThrowsAsync<AccountFailureException>(action);
        Assert.Equal(AccountFailure.InvalidInput, error.Failure);
        Assert.Equal("imageData", error.Field);
    }

    [Fact(
        DisplayName = "Given an oversized source, When decoded bytes exceed ten MB, Then a structured upload-too-large error is returned"
    )]
    public async Task RejectsSourceByteLimit()
    {
        // Given valid base64 at the maximum character count but too many decoded bytes.
        using var processor = new DoorImageProcessor();
        var input = Convert.ToBase64String(new byte[10_000_001]);

        // When processing checks the independent byte limit.
        var action = () => processor.ProcessAsync(input, CancellationToken.None);

        // Then transport encoding cannot bypass the source limit.
        var error = await Assert.ThrowsAsync<AccountFailureException>(action);
        Assert.Equal(AccountFailure.PayloadTooLarge, error.Failure);
    }

    [Fact(
        DisplayName = "Given a cancelled upload, When processing is requested, Then cancellation prevents native image work"
    )]
    public async Task HonorsCancellation()
    {
        // Given an already cancelled operation.
        using var processor = new DoorImageProcessor();
        using var cancellation = new CancellationTokenSource();
        await cancellation.CancelAsync();

        // When requesting image processing.
        var action = () => processor.ProcessAsync("invalid", cancellation.Token);

        // Then cancellation is preserved rather than mapped to validation.
        await Assert.ThrowsAnyAsync<OperationCanceledException>(action);
    }
}
