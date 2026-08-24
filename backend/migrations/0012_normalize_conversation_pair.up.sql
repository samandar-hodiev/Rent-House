-- 0012_normalize_conversation_pair — the pair is unordered.
--
-- 0009 made a conversation belong to a pair of people rather than to a listing,
-- but it spelled that pair as an ordered one: UNIQUE (buyer_id, owner_id).
-- Ordered columns cannot express "these two people", only "this buyer and this
-- owner", so the same two people still get two threads as soon as the roles
-- swap:
--
--   Alisher asks about Samandar's listing  -> (buyer Alisher, owner Samandar)
--   Samandar asks about Alisher's listing  -> (buyer Samandar, owner Alisher)
--
-- Both rows satisfy the constraint, so the chat list shows the same person
-- twice. This has already happened in practice.
--
-- After this migration the identity is the unordered pair, and buyer_id /
-- owner_id keep only their historical meaning: who opened the thread first.
-- Nothing else reads them as a role — the conversation list already resolves
-- "the other person" with a CASE over both columns, and the listing's owner is
-- read from the listing itself.
--
-- No message is deleted. Duplicate threads are merged message by message and
-- each message keeps the listing it was sent about.

-- ---------------------------------------------------------------------------
-- merge threads that are the same pair in the opposite order
-- ---------------------------------------------------------------------------

-- The survivor of each unordered pair is its oldest thread, so the pair keeps
-- the conversation they have had the longest. Same rule 0009 used.
CREATE TEMP TABLE pair_merge AS
SELECT
    c.id AS from_id,
    first_value(c.id) OVER (
        PARTITION BY LEAST(c.buyer_id, c.owner_id), GREATEST(c.buyer_id, c.owner_id)
        ORDER BY c.created_at, c.id
    ) AS into_id
FROM conversations c;

DELETE FROM pair_merge WHERE from_id = into_id;

-- Messages move across, each still carrying its own apartment_id, so a merged
-- thread can hold several listings' worth of correspondence without losing
-- which message was about which listing.
UPDATE messages m
SET conversation_id = pm.into_id
FROM pair_merge pm
WHERE m.conversation_id = pm.from_id;

-- Read state (messages.is_read / read_at) and per-person message deletions
-- (message_deletions keys on message_id) both hang off the message, so they
-- follow it across without any work here.

-- Per-person state merges towards "visible": if one copy was archived or
-- hidden and the other was not, the copy still in the inbox wins.
--
-- cleared_at is a history cutoff, and the earliest one keeps the most history
-- readable — which is the point of the merge, since the pair's whole
-- correspondence now lives in this single thread.
UPDATE conversation_participants keep
SET
    pinned_at   = COALESCE(keep.pinned_at, dup.pinned_at),
    archived_at = CASE
                      WHEN keep.archived_at IS NULL OR dup.archived_at IS NULL THEN NULL
                      ELSE LEAST(keep.archived_at, dup.archived_at)
                  END,
    hidden_at   = CASE
                      WHEN keep.hidden_at IS NULL OR dup.hidden_at IS NULL THEN NULL
                      ELSE LEAST(keep.hidden_at, dup.hidden_at)
                  END,
    cleared_at  = CASE
                      WHEN keep.cleared_at IS NULL OR dup.cleared_at IS NULL THEN NULL
                      ELSE LEAST(keep.cleared_at, dup.cleared_at)
                  END
FROM pair_merge pm
JOIN conversation_participants dup ON dup.conversation_id = pm.from_id
WHERE keep.conversation_id = pm.into_id
  AND keep.user_id = dup.user_id;

-- A participant present only on the losing thread joins the survivor.
INSERT INTO conversation_participants
    (conversation_id, user_id, created_at, pinned_at, archived_at, hidden_at, cleared_at)
SELECT pm.into_id, dup.user_id, dup.created_at,
       dup.pinned_at, dup.archived_at, dup.hidden_at, dup.cleared_at
FROM pair_merge pm
JOIN conversation_participants dup ON dup.conversation_id = pm.from_id
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- Withdrawn from both sides stays withdrawn only if every thread the pair had
-- was withdrawn. One live thread revives the merged one.
UPDATE conversations keep
SET deleted_at = NULL
FROM pair_merge pm
JOIN conversations dup ON dup.id = pm.from_id
WHERE keep.id = pm.into_id
  AND dup.deleted_at IS NULL;

-- The survivor's pinned context becomes the most recent listing the pair
-- actually wrote about, across both merged threads.
UPDATE conversations c
SET apartment_id = COALESCE((
    SELECT m.apartment_id
    FROM messages m
    WHERE m.conversation_id = c.id AND m.apartment_id IS NOT NULL
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
), c.apartment_id),
    updated_at = GREATEST(c.updated_at, (
        SELECT max(m.created_at) FROM messages m WHERE m.conversation_id = c.id
    ))
WHERE c.id IN (SELECT into_id FROM pair_merge);

-- The losing threads are now empty of everything that mattered.
DELETE FROM conversations WHERE id IN (SELECT from_id FROM pair_merge);

DROP TABLE pair_merge;

-- ---------------------------------------------------------------------------
-- the unordered identity
-- ---------------------------------------------------------------------------

ALTER TABLE conversations DROP CONSTRAINT uq_conversations_pair;

-- An expression index rather than a constraint, because a UNIQUE constraint
-- cannot be written over expressions. It enforces the same thing for both
-- orderings at once, and it is what "find or create" targets with ON CONFLICT,
-- so two simultaneous taps on "Xabar yozish" still cannot produce a second
-- thread.
CREATE UNIQUE INDEX uq_conversations_pair
    ON conversations (LEAST(buyer_id, owner_id), GREATEST(buyer_id, owner_id));
