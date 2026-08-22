-- Reverses the schema part of 0009.
--
-- What it cannot reverse is the merge. Threads that were separate before 0009
-- are one thread afterwards, and the record of where the seam was is gone —
-- every message kept its own listing, but nothing kept which thread it used to
-- belong to. Rolling back therefore leaves the pair with one conversation
-- containing everything, which is a lossless state but not the previous one.
--
-- The old UNIQUE (apartment_id, buyer_id) is not restored either: after the
-- merge a pair may legitimately have one thread referring to one listing while
-- holding messages about several, and re-adding the constraint would reject
-- rows that this schema was correct to produce.

DROP INDEX IF EXISTS idx_conversations_owner;

ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS ck_conversations_pair_distinct,
    DROP CONSTRAINT IF EXISTS uq_conversations_pair,
    DROP CONSTRAINT IF EXISTS fk_conversations_owner,
    DROP COLUMN IF EXISTS owner_id;

-- apartment_id goes back to being required and cascading. Any thread whose
-- listing has since been withdrawn has no value to restore, so it is removed
-- rather than guessed at.
DELETE FROM conversations WHERE apartment_id IS NULL;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS fk_conversations_apartment;
ALTER TABLE conversations ALTER COLUMN apartment_id SET NOT NULL;
ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_apartment
        FOREIGN KEY (apartment_id) REFERENCES apartments (id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_messages_apartment;
ALTER TABLE messages
    DROP CONSTRAINT IF EXISTS fk_messages_apartment,
    DROP COLUMN IF EXISTS apartment_id;
