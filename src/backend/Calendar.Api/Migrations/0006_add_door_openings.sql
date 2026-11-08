CREATE TABLE door_openings (
    calendar_id UUID NOT NULL,
    recipient_id UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (calendar_id, recipient_id, day_number),
    FOREIGN KEY (calendar_id, day_number) REFERENCES doors (calendar_id, day_number) ON DELETE CASCADE
);

CREATE INDEX calendars_recipient ON calendars (recipient_id, created_at DESC, id);
