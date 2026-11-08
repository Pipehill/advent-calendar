using System.Buffers.Binary;
using SkiaSharp;

namespace Calendar.Api.Tests;

internal static class DoorImageFixtures
{
    public static byte[] WithOrientation(byte[] jpeg, int orientation)
    {
        // Minimal EXIF TIFF with one orientation tag and no camera/location data.
        byte[] exif =
        [
            0xff,
            0xe1,
            0,
            34,
            69,
            120,
            105,
            102,
            0,
            0,
            73,
            73,
            42,
            0,
            8,
            0,
            0,
            0,
            1,
            0,
            0x12,
            1,
            3,
            0,
            1,
            0,
            0,
            0,
            (byte)orientation,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
        ];
        return [.. jpeg.AsSpan(0, 2), .. exif, .. jpeg.AsSpan(2)];
    }

    public static byte[] WithPngDimensions(byte[] png, int width, int height)
    {
        var bytes = png.ToArray();
        BinaryPrimitives.WriteInt32BigEndian(bytes.AsSpan(16), width);
        BinaryPrimitives.WriteInt32BigEndian(bytes.AsSpan(20), height);
        BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(29), Crc(bytes.AsSpan(12, 17)));
        return bytes;
    }

    public static byte[] AnimatedPng(byte[] png)
    {
        byte[] chunk = [0, 0, 0, 8, 97, 99, 84, 76, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0];
        BinaryPrimitives.WriteUInt32BigEndian(chunk.AsSpan(16), Crc(chunk.AsSpan(4, 12)));
        return [.. png.AsSpan(0, 33), .. chunk, .. png.AsSpan(33)];
    }

    private static uint Crc(ReadOnlySpan<byte> bytes)
    {
        var crc = uint.MaxValue;
        foreach (var value in bytes)
        {
            crc ^= value;
            for (var bit = 0; bit < 8; bit++)
                crc = (crc >> 1) ^ ((crc & 1) == 0 ? 0u : 0xedb88320u);
        }
        return ~crc;
    }

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
