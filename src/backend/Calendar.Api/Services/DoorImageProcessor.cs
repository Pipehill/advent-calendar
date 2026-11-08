using Calendar.Api.Models;
using SkiaSharp;

namespace Calendar.Api.Services;

public interface IDoorImageProcessor
{
    Task<DoorImage> ProcessAsync(string data, CancellationToken cancellationToken);
}

// Shared across requests: at most two native decoders and four queued uploads.
// Native codec calls are bounded by bytes/pixels; cancellation is checked between stages.
public sealed class DoorImageProcessor : IDoorImageProcessor, IDisposable
{
    public const int MaximumSourceBytes = 10_000_000;
    public const int MaximumStoredBytes = 1_000_000;
    public const int MaximumBase64Length = 13_333_336;
    private readonly SemaphoreSlim capacity = new(6, 6);
    private readonly SemaphoreSlim workers = new(2, 2);

    public async Task<DoorImage> ProcessAsync(string data, CancellationToken cancellationToken)
    {
        if (!await capacity.WaitAsync(0, cancellationToken))
            throw new AccountFailureException(
                AccountFailure.ResourceLimit,
                "Image processing busy"
            );
        try
        {
            await workers.WaitAsync(cancellationToken);
            try
            {
                return await Task.Run(() => Process(data, cancellationToken), cancellationToken);
            }
            finally
            {
                workers.Release();
            }
        }
        finally
        {
            capacity.Release();
        }
    }

    private static DoorImage Process(string data, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var bytes = DecodeBase64(data);
        using var encoded = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(encoded);
        if (
            codec is null
            || codec.EncodedFormat is not (SKEncodedImageFormat.Jpeg or SKEncodedImageFormat.Png)
        )
            throw Invalid();
        ImageSourceValidation.RequireStaticComplete(bytes, codec.EncodedFormat);
        var info = codec.Info;
        if (
            info.Width is < 1 or > 10_000
            || info.Height is < 1 or > 10_000
            || (long)info.Width * info.Height > 40_000_000
            || codec.FrameCount > 1
        )
            throw Invalid();
        cancellationToken.ThrowIfCancellationRequested();
        using var bitmap = new SKBitmap(
            new SKImageInfo(info.Width, info.Height, SKColorType.Rgba8888, SKAlphaType.Premul)
        );
        if (codec.GetPixels(bitmap.Info, bitmap.GetPixels()) != SKCodecResult.Success)
            throw Invalid();
        cancellationToken.ThrowIfCancellationRequested();
        return Encode(bitmap, codec.EncodedFormat, codec.EncodedOrigin, cancellationToken);
    }

    private static byte[] DecodeBase64(string data)
    {
        if (data.Length > MaximumBase64Length)
            throw TooLarge();
        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(data);
        }
        catch (FormatException)
        {
            throw Invalid();
        }
        if (bytes.Length > MaximumSourceBytes)
            throw TooLarge();
        if (bytes.Length == 0)
            throw Invalid();
        return bytes;
    }

    private static DoorImage Encode(
        SKBitmap bitmap,
        SKEncodedImageFormat format,
        SKEncodedOrigin origin,
        CancellationToken cancellationToken
    )
    {
        var rotated = origin is >= SKEncodedOrigin.LeftTop and <= SKEncodedOrigin.LeftBottom;
        var width = rotated ? bitmap.Height : bitmap.Width;
        var height = rotated ? bitmap.Width : bitmap.Height;
        var scale = Math.Min(1d, 1600d / Math.Max(width, height));
        // Always encode from pixels: source EXIF, location and ancillary metadata are discarded.
        for (var attempt = 0; attempt < 8; attempt++, scale *= 0.75)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var outputWidth = Math.Max(1, (int)(width * scale));
            var outputHeight = Math.Max(1, (int)(height * scale));
            using var output = new SKBitmap(
                outputWidth,
                outputHeight,
                SKColorType.Rgba8888,
                SKAlphaType.Premul
            );
            using (var canvas = new SKCanvas(output))
            {
                canvas.Clear(SKColors.Transparent);
                canvas.Scale((float)outputWidth / width, (float)outputHeight / height);
                canvas.Concat(Orientation(origin, bitmap.Width, bitmap.Height));
                using var image = SKImage.FromBitmap(bitmap);
                canvas.DrawImage(
                    image,
                    new SKRect(0, 0, bitmap.Width, bitmap.Height),
                    new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear)
                );
            }
            using var rendered = SKImage.FromBitmap(output);
            foreach (
                var quality in format == SKEncodedImageFormat.Jpeg
                    ? new[] { 90, 75, 60 }
                    : new[] { 100 }
            )
            {
                cancellationToken.ThrowIfCancellationRequested();
                using var result = rendered.Encode(format, quality);
                if (result is not null && result.Size is > 0 and <= MaximumStoredBytes)
                    return new DoorImage(
                        result.ToArray(),
                        format == SKEncodedImageFormat.Jpeg ? "image/jpeg" : "image/png",
                        outputWidth,
                        outputHeight,
                        Guid.NewGuid()
                    );
            }
        }
        throw Invalid();
    }

    private static SKMatrix Orientation(SKEncodedOrigin origin, int width, int height) =>
        origin switch
        {
            SKEncodedOrigin.TopRight => new(-1, 0, width, 0, 1, 0, 0, 0, 1),
            SKEncodedOrigin.BottomRight => new(-1, 0, width, 0, -1, height, 0, 0, 1),
            SKEncodedOrigin.BottomLeft => new(1, 0, 0, 0, -1, height, 0, 0, 1),
            SKEncodedOrigin.LeftTop => new(0, 1, 0, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightTop => new(0, -1, height, 1, 0, 0, 0, 0, 1),
            SKEncodedOrigin.RightBottom => new(0, -1, height, -1, 0, width, 0, 0, 1),
            SKEncodedOrigin.LeftBottom => new(0, 1, 0, -1, 0, width, 0, 0, 1),
            _ => SKMatrix.Identity,
        };

    internal static AccountFailureException Invalid() =>
        new(AccountFailure.InvalidInput, "Invalid or unsupported image", "imageData");

    private static AccountFailureException TooLarge() =>
        new(AccountFailure.PayloadTooLarge, "Image exceeds source limit", "imageData");

    public void Dispose()
    {
        capacity.Dispose();
        workers.Dispose();
    }
}
