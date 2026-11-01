-- The owner authorized removing legacy ownerless test calendars and their doors.
-- DbUp journals this transactional transition; subsequent startup preserves data.
DELETE FROM calendars;

CREATE FUNCTION valid_door_order(door_order INTEGER[]) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT coalesce(array_ndims(door_order) = 1
        AND array_lower(door_order, 1) = 1
        AND array_length(door_order, 1) = 24
        AND (SELECT array_agg(day ORDER BY day) FROM unnest(door_order) AS day)
            = ARRAY(SELECT generate_series(1, 24)), false);
$$;

ALTER TABLE calendars
ADD COLUMN owner_id UUID NOT NULL REFERENCES accounts (id),
ADD COLUMN recipient_id UUID NOT NULL REFERENCES accounts (id),
ADD COLUMN calendar_year INTEGER NOT NULL CHECK (calendar_year BETWEEN 1 AND 9999),
ADD COLUMN background TEXT NOT NULL CHECK (background IN ('woodland', 'sleigh', 'playtime', 'aurora')),
ADD COLUMN layout TEXT NOT NULL CHECK (layout IN ('chronological', 'random')),
ADD COLUMN door_order INTEGER[] NOT NULL CHECK (valid_door_order(door_order)),
ADD CONSTRAINT chronological_door_order CHECK (
    layout <> 'chronological' OR door_order = ARRAY[
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
        13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24
    ]
),
ADD CONSTRAINT different_calendar_accounts CHECK (owner_id <> recipient_id);

ALTER TABLE doors
ADD COLUMN content_title TEXT NOT NULL DEFAULT '' CHECK (char_length(content_title) <= 50),
ADD CONSTRAINT door_message_length CHECK (char_length(content_text) <= 5000);

CREATE INDEX calendars_owner ON calendars (owner_id, created_at DESC, id);
