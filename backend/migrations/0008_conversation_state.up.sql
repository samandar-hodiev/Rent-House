-- 0008_conversation_state — pin, archive and delete, per person.
--
-- Pinning, archiving and "delete for me" are opinions one participant holds
-- about a thread, not facts about the thread. They belong on
-- conversation_participants, which is already keyed on (conversation, user) and
-- is exactly one row per person per thread — so User A pinning something cannot
-- reach User B's copy, because there is no shared column to reach.
--
-- "Delete for everyone" is the opposite: a fact about the thread, so it goes on
-- conversations.

-- ---------------------------------------------------------------------------
-- conversation_participants: one person's view of a thread
-- ---------------------------------------------------------------------------

-- Timestamps rather than booleans. "When did you pin this" orders the pinned
-- group; "when did you delete this" is the cutoff that decides which messages
-- are still yours to read and whether a later message brings the thread back.
ALTER TABLE conversation_participants
    ADD COLUMN pinned_at   timestamptz,
    ADD COLUMN archived_at timestamptz,
    ADD COLUMN deleted_at  timestamptz;

-- The list query filters on (user, archived, deleted) and orders by pin.
-- Partial, because the overwhelming majority of rows are none of the three and
-- indexing them would be indexing the default.
CREATE INDEX idx_conversation_participants_pinned
    ON conversation_participants (user_id, pinned_at DESC)
    WHERE pinned_at IS NOT NULL;

CREATE INDEX idx_conversation_participants_archived
    ON conversation_participants (user_id)
    WHERE archived_at IS NOT NULL;

CREATE INDEX idx_conversation_participants_deleted
    ON conversation_participants (user_id)
    WHERE deleted_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- conversations: withdrawn from both sides
-- ---------------------------------------------------------------------------

-- Soft, not a DELETE. The rows stay so an in-flight request cannot resurrect a
-- half-removed thread through a foreign key, and so the removal is a state the
-- backend enforces on every read rather than an absence the frontend has to be
-- trusted to respect.
ALTER TABLE conversations
    ADD COLUMN deleted_at timestamptz;

-- Every listing of every kind starts by excluding these, so the index is on
-- the few that are set.
CREATE INDEX idx_conversations_deleted
    ON conversations (id)
    WHERE deleted_at IS NOT NULL;
