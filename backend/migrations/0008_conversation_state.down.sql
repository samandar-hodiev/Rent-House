-- Reverses 0008. Dropping these columns discards every pin, archive and
-- per-user deletion; threads withdrawn from both sides become visible again,
-- because the only record that they were withdrawn was conversations.deleted_at.

DROP INDEX IF EXISTS idx_conversations_deleted;
ALTER TABLE conversations DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_conversation_participants_deleted;
DROP INDEX IF EXISTS idx_conversation_participants_archived;
DROP INDEX IF EXISTS idx_conversation_participants_pinned;

ALTER TABLE conversation_participants
    DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS archived_at,
    DROP COLUMN IF EXISTS pinned_at;
