-- 0011_user_blocks — one person refusing to hear from another.
--
-- Stored one-directionally: the row says who did the blocking, which is the
-- only party who can undo it. Its *effect* is mutual — neither side can write
-- to the other — because a block that only stopped incoming messages would
-- leave the blocker able to keep writing to someone who cannot answer.

CREATE TABLE user_blocks (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    blocker_id uuid        NOT NULL,
    blocked_id uuid        NOT NULL,

    -- Why, if they said. Both optional: blocking someone must not require
    -- explaining yourself, and a mandatory field would only produce noise.
    reason      varchar(30),
    reason_text text,

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_user_blocks PRIMARY KEY (id),

    -- Blocking twice is the same block, not a second one. The constraint is
    -- what makes "block" idempotent under a double tap or a retried request,
    -- rather than a check the application has to remember to run.
    CONSTRAINT uq_user_blocks_pair UNIQUE (blocker_id, blocked_id),
    -- Nobody blocks themselves. Rejected here as well as in the service, so it
    -- is impossible rather than merely guarded against.
    CONSTRAINT ck_user_blocks_distinct CHECK (blocker_id <> blocked_id),

    -- A closed account takes its blocks with it, in both directions.
    CONSTRAINT fk_user_blocks_blocker
        FOREIGN KEY (blocker_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_blocks_blocked
        FOREIGN KEY (blocked_id) REFERENCES users (id) ON DELETE CASCADE
);

-- The unique constraint already covers "who has this user blocked" — it leads
-- with blocker_id. This is the reverse: "who has blocked this user", which is
-- what the send check asks about the recipient.
CREATE INDEX idx_user_blocks_blocked ON user_blocks (blocked_id);
