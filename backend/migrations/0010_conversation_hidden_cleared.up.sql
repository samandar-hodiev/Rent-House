-- 0010_conversation_hidden_cleared — stop reopening a thread from destroying it.
--
-- 0008 gave each participant one `deleted_at`, doing two jobs at once: "this
-- thread is out of my list" and "messages before this are no longer mine to
-- read". They coincide for "delete for me", so one column looked sufficient.
--
-- They do not coincide when a thread withdrawn from both sides is reopened.
-- UNIQUE (buyer_id, owner_id) means the pair cannot get a second row, so
-- reopening has to reuse the old one — and a reopened thread with a cutoff and
-- no newer messages was invisible under the list's "hidden until something
-- arrives" rule. The workaround was to delete the messages outright.
--
-- That was already destructive, and 0009 made it far worse: a conversation is
-- now the pair's whole correspondence, so reopening wiped every message they
-- had ever exchanged about every listing rather than one listing's thread.
--
-- Splitting the column separates the two questions, and nothing has to be
-- destroyed to answer either.

ALTER TABLE conversation_participants
    -- Out of my list. A later message clears it, which is what lets the other
    -- side reach someone who deleted the thread.
    ADD COLUMN hidden_at timestamptz,
    -- The history cutoff. Messages at or before it are not served to this
    -- user — they stay on the row for the other participant, who deleted
    -- nothing.
    ADD COLUMN cleared_at timestamptz;

-- "Delete for me" set both meanings at once, so the existing value is both.
UPDATE conversation_participants
SET hidden_at = deleted_at, cleared_at = deleted_at
WHERE deleted_at IS NOT NULL;

ALTER TABLE conversation_participants DROP COLUMN deleted_at;

DROP INDEX IF EXISTS idx_conversation_participants_deleted;

-- The list query filters on hidden_at; cleared_at is read per row while
-- serving one thread, so only the first is worth an index.
CREATE INDEX idx_conversation_participants_hidden
    ON conversation_participants (user_id)
    WHERE hidden_at IS NOT NULL;
