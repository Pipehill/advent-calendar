CREATE TABLE calendars (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_modified_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE doors (
    calendar_id UUID NOT NULL REFERENCES calendars (id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 24),
    content_text TEXT NOT NULL,
    PRIMARY KEY (calendar_id, day_number)
);
