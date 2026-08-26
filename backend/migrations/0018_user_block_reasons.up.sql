-- 0018_user_block_reasons — why an account was blocked, by whom, and when.
--
-- A history table, not a column on `users`. A block is an event: it happens at
-- a time, for a reason, by somebody. Three columns on the account would hold
-- only the latest one and would be wiped by the next unblock, so the question
-- "has this person been blocked before, and what for" could never be answered.
-- `users.status` stays as the current-state flag the list filters on; this is
-- the record behind it.
CREATE TABLE admin_user_blocks (
    id      uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,

    -- Who blocked them. Kept even if that administrator's account is later
    -- removed: ON DELETE SET NULL rather than CASCADE, because deleting an
    -- administrator must not erase the record of what they did.
    blocked_by uuid,
    -- Required. An administrator taking somebody's access away has to say why,
    -- and the service refuses an empty one before this constraint is reached.
    reason     text        NOT NULL,
    blocked_at timestamptz NOT NULL DEFAULT now(),

    -- Null while the block is in force. Set when it is lifted, which is what
    -- keeps the history: an unblock closes a row rather than deleting it.
    unblocked_at timestamptz,
    unblocked_by uuid,

    CONSTRAINT pk_admin_user_blocks PRIMARY KEY (id),
    CONSTRAINT ck_admin_user_blocks_reason CHECK (btrim(reason) <> ''),

    CONSTRAINT fk_admin_user_blocks_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_admin_user_blocks_blocked_by
        FOREIGN KEY (blocked_by) REFERENCES admins (id) ON DELETE SET NULL,
    CONSTRAINT fk_admin_user_blocks_unblocked_by
        FOREIGN KEY (unblocked_by) REFERENCES admins (id) ON DELETE SET NULL
);

-- One block in force per account at a time. Without it, two administrators
-- acting at once would leave two open rows and "the reason" would be ambiguous.
CREATE UNIQUE INDEX uq_admin_user_blocks_open
    ON admin_user_blocks (user_id) WHERE unblocked_at IS NULL;

-- The list joins the open block onto every blocked account, newest first.
CREATE INDEX idx_admin_user_blocks_user ON admin_user_blocks (user_id, blocked_at DESC);
