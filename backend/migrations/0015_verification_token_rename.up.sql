-- 0015_verification_token_rename — the token column is not registration's alone.
--
-- `registration_token_hash` holds a hashed, single-use, short-lived secret
-- handed to somebody who has proved they control a contact. Password reset
-- needs exactly that, and the row's `purpose` already says which flow it
-- belongs to — so the column is renamed to what it actually is rather than
-- copied, which would leave two columns doing one job.
--
-- Renames only. No data moves and nothing is dropped.

ALTER TABLE auth_verifications RENAME COLUMN registration_token_hash TO token_hash;
ALTER TABLE auth_verifications RENAME COLUMN registration_token_expires_at TO token_expires_at;
