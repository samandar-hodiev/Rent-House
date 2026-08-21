-- Reverses 0004. Dropping a column takes its constraints with it; indexes and
-- tables are named separately and have to go explicitly.

DROP TABLE IF EXISTS message_deletions;

DROP INDEX IF EXISTS idx_messages_unread_sender;
DROP INDEX IF EXISTS idx_messages_conversation_cursor;

-- Restore 0001's unconditional constraint. Any withdrawn message would now
-- violate it, so their bodies are given a placeholder first.
UPDATE messages SET body = '(deleted)' WHERE deleted_at IS NOT NULL AND btrim(body) = '';
ALTER TABLE messages DROP CONSTRAINT IF EXISTS ck_messages_body_not_blank;
ALTER TABLE messages ADD CONSTRAINT ck_messages_body_not_blank CHECK (btrim(body) <> '');

ALTER TABLE messages
    DROP COLUMN IF EXISTS read_at,
    DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS edited_at;

DROP INDEX IF EXISTS idx_conversations_buyer_updated;

ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS uq_conversations_apartment_buyer,
    DROP CONSTRAINT IF EXISTS fk_conversations_buyer,
    DROP COLUMN IF EXISTS buyer_id;
