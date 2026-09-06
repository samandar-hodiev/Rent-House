-- 0028_user_account_deletion — a marketplace account can end itself.
--
-- The row is kept rather than removed: apartments, chat history, favorites and
-- reports all reference it by id, and owner_id cascades on delete — removing
-- the row outright would take every listing, and every conversation about one,
-- with it. Deleting an account is instead anonymizing it in place (see
-- AuthService.DeleteAccount): scrubbed name and contact, an unusable password,
-- sign-in refused. Everything that referenced this person keeps referencing a
-- row that is still there, just no longer them.
ALTER TABLE users
    DROP CONSTRAINT ck_users_status;

ALTER TABLE users
    ADD CONSTRAINT ck_users_status CHECK (status IN ('active', 'blocked', 'deleted'));

-- When, so an administrator looking at an account can tell "this person left"
-- from "this row has always looked like this" — and so a future cleanup job
-- has something to sort by, though none exists yet.
ALTER TABLE users
    ADD COLUMN deleted_at timestamptz;

CREATE INDEX idx_users_deleted ON users (deleted_at DESC) WHERE deleted_at IS NOT NULL;
