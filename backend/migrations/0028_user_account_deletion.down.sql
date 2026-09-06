DROP INDEX IF EXISTS idx_users_deleted;

ALTER TABLE users
    DROP COLUMN IF EXISTS deleted_at;

ALTER TABLE users
    DROP CONSTRAINT ck_users_status;

ALTER TABLE users
    ADD CONSTRAINT ck_users_status CHECK (status IN ('active', 'blocked'));
