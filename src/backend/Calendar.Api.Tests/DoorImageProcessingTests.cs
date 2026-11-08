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
    [InlineData("pixels")]
    [InlineData("animation")]
    [InlineData("concatenated-jpeg")]
    [InlineData("concatenated-jpeg-large")]
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
            "pixels" => DoorImageFixtures.WithPngDimensions(DoorImageFixtures.Create(), 7000, 6000),
            "animation" => DoorImageFixtures.AnimatedPng(DoorImageFixtures.Create()),
            "concatenated-jpeg" =>
            [
                .. DoorImageFixtures.Create(SKEncodedImageFormat.Jpeg),
                .. DoorImageFixtures.Create(SKEncodedImageFormat.Jpeg),
            ],
            "concatenated-jpeg-large" =>
            [
                .. DoorImageFixtures.Create(SKEncodedImageFormat.Jpeg),
                .. DoorImageFixtures.Create(SKEncodedImageFormat.Jpeg, 1600, 1000, noise: true),
            ],
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

    [Theory(
        DisplayName = "Given an oriented JPEG, When pixels are re-encoded, Then orientation is applied and EXIF is discarded"
    )]
    [InlineData(1, 120, 60)]
    [InlineData(2, 120, 60)]
    [InlineData(3, 120, 60)]
    [InlineData(4, 120, 60)]
    [InlineData(5, 60, 120)]
    [InlineData(6, 60, 120)]
    [InlineData(7, 60, 120)]
    [InlineData(8, 60, 120)]
    public async Task AppliesOrientation(int orientation, int width, int height)
    {
        // Given a JPEG carrying an actual EXIF orientation tag.
        using var processor = new DoorImageProcessor();
        var source = DoorImageFixtures.WithOrientation(
            DoorImageFixtures.Create(SKEncodedImageFormat.Jpeg),
            orientation
        );

        // When native decode/render/encode processes the image.
        var result = await processor.ProcessAsync(
            Convert.ToBase64String(source),
            CancellationToken.None
        );
        using var encoded = SKData.CreateCopy(result.Data);
        using var codec = SKCodec.Create(encoded);

        // Then output dimensions follow orientation, with no source EXIF left to apply again.
        Assert.Equal(width, result.Width);
        Assert.Equal(height, result.Height);
        Assert.Equal(SKEncodedOrigin.TopLeft, codec.EncodedOrigin);
        Assert.False(result.Data.AsSpan().IndexOf("Exif"u8) >= 0);
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

    [Fact(
        DisplayName = "Given busy native processors, When uploads queue overflow or cancel, Then capacity stays bounded and queued cancellation releases its permit"
    )]
    public async Task BoundsQueuedWork()
    {
        // Given two substantial native jobs occupying the worker pool.
        using var processor = new DoorImageProcessor();
        var data = Convert.ToBase64String(
            DoorImageFixtures.Create(width: 1600, height: 1000, noise: true)
        );
        var first = processor.ProcessAsync(data, CancellationToken.None);
        var second = processor.ProcessAsync(data, CancellationToken.None);
        using var cancellation = new CancellationTokenSource();

        // When a queued upload is cancelled and a burst exceeds the remaining bounded capacity.
        var queued = processor.ProcessAsync(data, cancellation.Token);
        await cancellation.CancelAsync();
        var burst = Enumerable
            .Range(0, 12)
            .Select(async _ =>
            {
                try
                {
                    await processor.ProcessAsync(data, CancellationToken.None);
                    return true;
                }
                catch (AccountFailureException error)
                    when (error.Failure == AccountFailure.ResourceLimit)
                {
                    return false;
                }
            })
            .ToArray();
        var outcomes = await Task.WhenAll(burst);
        var cancelled = () => queued;

        // Then overflow is rejected, queued work cancels, and both original jobs finish normally.
        Assert.Contains(false, outcomes);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(cancelled);
        Assert.NotNull(await first);
        Assert.NotNull(await second);
    }
}
