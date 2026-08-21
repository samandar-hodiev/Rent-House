-- Reverses 0005.

DROP TABLE IF EXISTS message_attachments;

-- Restore 0004's constraint. Any attachment-only message would now violate it,
-- so their bodies are given a placeholder first.
UPDATE messages SET body = '(attachment)'
WHERE deleted_at IS NULL AND btrim(body) = '';

ALTER TABLE messages DROP CONSTRAINT IF EXISTS ck_messages_body_not_blank;
ALTER TABLE messages ADD CONSTRAINT ck_messages_body_not_blank
    CHECK (deleted_at IS NOT NULL OR btrim(body) <> '');

ALTER TABLE messages DROP CONSTRAINT IF EXISTS ck_messages_kind;
ALTER TABLE messages DROP COLUMN IF EXISTS kind;
