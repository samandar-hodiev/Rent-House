ALTER TABLE messages DROP CONSTRAINT IF EXISTS fk_messages_deleted_by;
ALTER TABLE messages DROP COLUMN IF EXISTS deleted_by;
