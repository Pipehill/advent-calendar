-- Keep existing hashes, account state and business data. Affected users must log in again.
-- Stop the old backend before deployment so it cannot create new temporary user passwords.
SELECT pg_advisory_xact_lock(800008);

WITH converted AS (
    UPDATE accounts
    SET
        must_change_password = false,
        temporary_password_expires_at = null,
        security_version = gen_random_uuid()
    WHERE
        account_role = 'calendarUser'
        AND (must_change_password OR temporary_password_expires_at IS NOT null)
    RETURNING id
)

UPDATE account_sessions
SET revoked = true
WHERE account_id IN (SELECT id FROM converted);
