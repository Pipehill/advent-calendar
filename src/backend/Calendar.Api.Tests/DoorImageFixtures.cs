using SkiaSharp;

namespace Calendar.Api.Tests;

internal static class DoorImageFixtures
{
    public static byte[] Create(
        SKEncodedImageFormat format = SKEncodedImageFormat.Png,
        int width = 120,
        int height = 60,
        bool noise = false
    )
    {
        using var bitmap = new SKBitmap(width, height);
        if (noise)
        {
            var random = new Random(18);
            var pixels = new SKColor[width * height];
            for (var i = 0; i < pixels.Length; i++)
                pixels[i] = new SKColor(
                    (byte)random.Next(256),
                    (byte)random.Next(256),
                    (byte)random.Next(256),
                    128
                );
            bitmap.Pixels = pixels;
        }
        else
        {
            using var canvas = new SKCanvas(bitmap);
            canvas.Clear(new SKColor(30, 100, 200, 128));
        }
        using var image = SKImage.FromBitmap(bitmap);
        using var encoded = image.Encode(format, 100);
        return encoded.ToArray();
    }
}
