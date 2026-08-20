-- Reverses 0002_auth_verifications.
--
-- Restoring NOT NULL only succeeds if every row still has both contacts. Any
-- account registered with a phone alone would block it, which is correct: the
-- rollback should fail loudly rather than delete accounts to make room.

DROP TABLE IF EXISTS auth_verifications;

ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_contact_present;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
