ALTER TABLE doors
ADD COLUMN image_data BYTEA,
ADD COLUMN image_media_type TEXT,
ADD COLUMN image_width INTEGER,
ADD COLUMN image_height INTEGER,
ADD COLUMN image_version UUID,
ADD CONSTRAINT doors_image_consistent CHECK (
    (
        image_data IS NULL AND image_media_type IS NULL
        AND image_width IS NULL AND image_height IS NULL AND image_version IS NULL
    ) OR (
        image_data IS NOT NULL AND image_media_type IS NOT NULL
        AND image_width IS NOT NULL AND image_height IS NOT NULL AND image_version IS NOT NULL
        AND octet_length(image_data) BETWEEN 1 AND 1000000
        AND image_media_type IN ('image/jpeg', 'image/png')
        AND image_width BETWEEN 1 AND 1600 AND image_height BETWEEN 1 AND 1600
    )
);
