using System.Buffers.Binary;
using SkiaSharp;

namespace Calendar.Api.Services;

internal static class ImageSourceValidation
{
    public static void RequireStaticComplete(ReadOnlySpan<byte> bytes, SKEncodedImageFormat format)
    {
        if (format == SKEncodedImageFormat.Png)
            RequireStaticPng(bytes);
        else
            RequireSingleJpeg(bytes);
    }

    private static void RequireStaticPng(ReadOnlySpan<byte> bytes)
    {
        var offset = 8;
        while (offset <= bytes.Length - 12)
        {
            var length = BinaryPrimitives.ReadUInt32BigEndian(bytes[offset..]);
            if (length > bytes.Length - offset - 12)
                throw DoorImageProcessor.Invalid();
            var type = bytes.Slice(offset + 4, 4);
            // Reject APNG even when a codec would expose only its default frame.
            if (type.SequenceEqual("acTL"u8))
                throw DoorImageProcessor.Invalid();
            offset += (int)length + 12;
            if (type.SequenceEqual("IEND"u8) && length == 0 && offset == bytes.Length)
                return;
        }
        throw DoorImageProcessor.Invalid();
    }

    private static void RequireSingleJpeg(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length < 4 || !bytes[^2..].SequenceEqual(new byte[] { 0xff, 0xd9 }))
            throw DoorImageProcessor.Invalid();
        var offset = 2;
        var entropy = false;
        while (offset < bytes.Length)
        {
            if (bytes[offset++] != 0xff)
            {
                if (entropy)
                    continue;
                break;
            }
            while (offset < bytes.Length && bytes[offset] == 0xff)
                offset++;
            if (offset >= bytes.Length)
                break;
            var marker = bytes[offset++];
            if (entropy && (marker == 0 || marker is >= 0xd0 and <= 0xd7))
                continue;
            if (marker == 0xd9)
            {
                if (offset == bytes.Length)
                    return;
                break;
            }
            if (marker == 0xd8 || bytes.Length - offset < 2)
                break;
            var length = BinaryPrimitives.ReadUInt16BigEndian(bytes[offset..]);
            if (length < 2 || length > bytes.Length - offset)
                break;
            // Multi-Picture Format JPEGs contain an MPF APP2 segment.
            if (
                marker == 0xe2
                && length >= 6
                && bytes.Slice(offset + 2, 4).SequenceEqual("MPF\0"u8)
            )
                break;
            offset += length;
            entropy = marker == 0xda;
        }
        throw DoorImageProcessor.Invalid();
    }
}
