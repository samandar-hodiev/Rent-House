-- 0009_direct_conversations — one thread per pair of people, not per listing.
--
-- A conversation was identified by (apartment, buyer), so the same two people
-- writing about a second listing got a second thread. That is the wrong
-- identity: they are one pair of people having one conversation, and the
-- listing is what a message is *about*.
--
-- After this migration:
--   conversation identity = (buyer, owner)
--   apartment            = context, carried on each message
--
-- Nothing is thrown away. Duplicate threads are merged message by message, and
-- every message keeps the listing it was sent from.

-- ---------------------------------------------------------------------------
-- messages: which listing this message is about
-- ---------------------------------------------------------------------------

-- Nullable and ON DELETE SET NULL: a listing can be withdrawn while the
-- conversation about it continues, and the message must survive that. Before
-- this, deleting a listing cascaded the whole thread away.
ALTER TABLE messages
    ADD COLUMN apartment_id uuid,
    ADD CONSTRAINT fk_messages_apartment
        FOREIGN KEY (apartment_id) REFERENCES apartments (id) ON DELETE SET NULL;

-- Every existing message was sent in a thread about exactly one listing, so
-- that listing is its context.
UPDATE messages m
SET apartment_id = c.apartment_id
FROM conversations c
WHERE c.id = m.conversation_id;

-- "Show me the messages about this listing", and the context lookup the chat
-- header does when it walks back to find the previous context.
CREATE INDEX idx_messages_apartment ON messages (apartment_id) WHERE apartment_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- conversations: identity becomes the pair
-- ---------------------------------------------------------------------------

ALTER TABLE conversations ADD COLUMN owner_id uuid;

-- The other side of the thread has always been the listing's owner.
UPDATE conversations c
SET owner_id = a.owner_id
FROM apartments a
WHERE a.id = c.apartment_id;

-- A thread whose listing has vanished cannot name its owner. None should
-- exist — the old foreign key cascaded them away — but the column is about to
-- become NOT NULL, so this is stated rather than assumed.
DELETE FROM conversations WHERE owner_id IS NULL;

-- The listing no longer identifies a thread, so it no longer constrains one.
--
-- Dropped before the merge rather than after: the merge reassigns a survivor's
-- context to the pair's most recent listing, which can be a listing another
-- surviving row still names — a collision under the old constraint, and not a
-- problem under the new one.
ALTER TABLE conversations DROP CONSTRAINT uq_conversations_apartment_buyer;

-- ---------------------------------------------------------------------------
-- merge the duplicates
-- ---------------------------------------------------------------------------

-- The survivor of each (buyer, owner) group is its oldest thread, so the pair
-- keeps the conversation they have had the longest.
CREATE TEMP TABLE conversation_merge AS
SELECT
    c.id AS from_id,
    first_value(c.id) OVER (
        PARTITION BY c.buyer_id, c.owner_id ORDER BY c.created_at, c.id
    ) AS into_id
FROM conversations c;

DELETE FROM conversation_merge WHERE from_id = into_id;

-- Messages move across, each still carrying the listing it was about. This is
-- the whole reason messages.apartment_id was filled in first: without it, the
-- merge would flatten several listings into one and lose which was which.
UPDATE messages m
SET conversation_id = cm.into_id
FROM conversation_merge cm
WHERE m.conversation_id = cm.from_id;

-- Per-person state is merged towards "visible": a pair of rows where one side
-- archived or deleted its copy and the other did not resolves to the copy that
-- is still in the inbox. Deleting is the destructive reading, so it loses.
UPDATE conversation_participants keep
SET
    pinned_at   = COALESCE(keep.pinned_at, dup.pinned_at),
    archived_at = CASE
                      WHEN keep.archived_at IS NULL OR dup.archived_at IS NULL THEN NULL
                      ELSE LEAST(keep.archived_at, dup.archived_at)
                  END,
    -- The earliest cutoff keeps the most history readable.
    deleted_at  = CASE
                      WHEN keep.deleted_at IS NULL OR dup.deleted_at IS NULL THEN NULL
                      ELSE LEAST(keep.deleted_at, dup.deleted_at)
                  END
FROM conversation_merge cm
JOIN conversation_participants dup ON dup.conversation_id = cm.from_id
WHERE keep.conversation_id = cm.into_id
  AND keep.user_id = dup.user_id;

-- A participant present only on the losing thread joins the survivor.
INSERT INTO conversation_participants
    (conversation_id, user_id, created_at, pinned_at, archived_at, deleted_at)
SELECT cm.into_id, dup.user_id, dup.created_at, dup.pinned_at, dup.archived_at, dup.deleted_at
FROM conversation_merge cm
JOIN conversation_participants dup ON dup.conversation_id = cm.from_id
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- A thread withdrawn from both sides stays withdrawn only if every thread the
-- pair had was withdrawn. One live thread revives the merged one.
UPDATE conversations keep
SET deleted_at = NULL
FROM conversation_merge cm
JOIN conversations dup ON dup.id = cm.from_id
WHERE keep.id = cm.into_id
  AND dup.deleted_at IS NULL;

-- The survivor's own listing context becomes the most recent one the pair
-- actually wrote about.
UPDATE conversations c
SET apartment_id = COALESCE((
    SELECT m.apartment_id
    FROM messages m
    WHERE m.conversation_id = c.id AND m.apartment_id IS NOT NULL
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
), c.apartment_id);

-- The losing threads are now empty of everything that mattered.
DELETE FROM conversations WHERE id IN (SELECT from_id FROM conversation_merge);

DROP TABLE conversation_merge;

-- ---------------------------------------------------------------------------
-- the new identity
-- ---------------------------------------------------------------------------

-- It becomes the thread's current context: nullable, because the listing it
-- last referred to can be withdrawn while the conversation carries on.
ALTER TABLE conversations DROP CONSTRAINT fk_conversations_apartment;
ALTER TABLE conversations ALTER COLUMN apartment_id DROP NOT NULL;
ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_apartment
        FOREIGN KEY (apartment_id) REFERENCES apartments (id) ON DELETE SET NULL;

ALTER TABLE conversations
    ALTER COLUMN owner_id SET NOT NULL,
    ADD CONSTRAINT fk_conversations_owner
        FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
    -- The rule this migration exists for, enforced by the database rather than
    -- by remembering to check: two people have one direct conversation. It is
    -- also what makes "find or create" safe under concurrency — the second
    -- insert loses to the constraint instead of producing a duplicate.
    ADD CONSTRAINT uq_conversations_pair UNIQUE (buyer_id, owner_id),
    -- Nobody has a direct conversation with themselves.
    ADD CONSTRAINT ck_conversations_pair_distinct CHECK (buyer_id <> owner_id);

CREATE INDEX idx_conversations_owner ON conversations (owner_id);
