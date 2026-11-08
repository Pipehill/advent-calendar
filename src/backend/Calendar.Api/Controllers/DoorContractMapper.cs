using Calendar.Api.Generated;
using Calendar.Api.Models;

namespace Calendar.Api.Controllers;

internal static class DoorContractMapper
{
    public static DoorDto Map(DoorModel door) =>
        new()
        {
            Number = door.Number,
            Title = door.Title,
            Text = door.Text,
            Image = door.Image is { } image
                ? new Image
                {
                    Version = image.Version,
                    MediaType = image.MediaType,
                    Width = image.Width,
                    Height = image.Height,
                }
                : null,
        };

    public static DoorImageDto MapImage(DoorImage image) =>
        new()
        {
            Data = Convert.ToBase64String(image.Data),
            Metadata = new DoorImageMetadataDto
            {
                Version = image.Version,
                MediaType = image.MediaType,
                Width = image.Width,
                Height = image.Height,
            },
        };
}
