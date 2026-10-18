CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    user_name TEXT NOT NULL CHECK (char_length(user_name) BETWEEN 3 AND 64),
    normalized_user_name TEXT COLLATE "C" NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    account_role TEXT NOT NULL CHECK (account_role IN ('superadmin', 'calendarAdmin', 'calendarUser')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    security_version UUID NOT NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    temporary_password_expires_at TIMESTAMP WITH TIME ZONE,
    locked_until TIMESTAMP WITH TIME ZONE,
    responsible_administrator_id UUID REFERENCES accounts (id),
    created_by_id UUID REFERENCES accounts (id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CHECK (account_role <> 'calendarUser' OR responsible_administrator_id IS NOT null),
    CHECK (responsible_administrator_id IS null OR responsible_administrator_id <> id),
    CHECK (must_change_password = (temporary_password_expires_at IS NOT null))
);

CREATE INDEX accounts_responsibility ON accounts (responsible_administrator_id, account_role);

CREATE TABLE account_sessions (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts (id),
    security_version UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE,
    is_restricted BOOLEAN NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT false,
    CHECK (expires_at > created_at)
);

CREATE INDEX account_sessions_account ON account_sessions (account_id);

CREATE TABLE password_failures (
    account_id UUID NOT NULL REFERENCES accounts (id),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX password_failures_window ON password_failures (account_id, occurred_at);

CREATE FUNCTION preserve_account_responsibility() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.responsible_administrator_id IS NOT NULL
        AND NEW.responsible_administrator_id IS DISTINCT FROM OLD.responsible_administrator_id THEN
        RAISE EXCEPTION 'Account responsibility is immutable';
    END IF;
    IF NEW.created_by_id IS DISTINCT FROM OLD.created_by_id THEN
        RAISE EXCEPTION 'Account creator is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER immutable_account_audit
BEFORE UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION preserve_account_responsibility();
