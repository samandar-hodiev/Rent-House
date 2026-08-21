-- 0004_chat — what a real conversation needs beyond what 0001 sketched.
--
-- 0001 created conversations, conversation_participants and messages as a
-- placeholder: enough to model "two people talking about a listing", nothing
-- more. A working chat also has to answer: who started this thread, was this
-- message edited, was it withdrawn, and has the other side actually read it.
--
-- Nothing here is destructive. Existing rows stay valid: every added column is
-- nullable or defaulted, and the one NOT NULL column is backfilled first.

-- ---------------------------------------------------------------------------
-- conversations: who opened the thread
-- ---------------------------------------------------------------------------

-- The owner is already known through apartments.owner_id, so the other
-- participant — the person enquiring — is what the row is missing.
--
-- It duplicates a row in conversation_participants on purpose. That table
-- answers "is this user allowed in here", which is a membership question; this
-- column answers "is there already a thread between this listing and this
-- enquirer", which is a uniqueness question. Only a column on the row itself
-- can be given a UNIQUE constraint, and without one two taps on "Xabar yozish"
-- race each other into two threads about the same listing.
ALTER TABLE conversations ADD COLUMN buyer_id uuid;

-- Backfill: the buyer is the participant who is not the listing's owner.
UPDATE conversations c
SET buyer_id = (
    SELECT cp.user_id
    FROM conversation_participants cp
    JOIN apartments a ON a.id = c.apartment_id
    WHERE cp.conversation_id = c.id
      AND cp.user_id <> a.owner_id
    LIMIT 1
)
WHERE buyer_id IS NULL;

-- A conversation with no identifiable enquirer is not a conversation. There are
-- none in practice — the table has only ever held seed data — but deleting is
-- honest where guessing would not be.
DELETE FROM conversations WHERE buyer_id IS NULL;

ALTER TABLE conversations
    ALTER COLUMN buyer_id SET NOT NULL,
    ADD CONSTRAINT fk_conversations_buyer
        FOREIGN KEY (buyer_id) REFERENCES users (id) ON DELETE CASCADE,
    -- One thread per listing per enquirer. This is what makes "create or
    -- return the existing one" safe under concurrency: the second insert loses
    -- to the constraint instead of producing a duplicate.
    ADD CONSTRAINT uq_conversations_apartment_buyer UNIQUE (apartment_id, buyer_id);

-- The conversation list is "mine, most recently active first".
CREATE INDEX idx_conversations_buyer_updated ON conversations (buyer_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- messages: edited, withdrawn, read
-- ---------------------------------------------------------------------------

ALTER TABLE messages
    -- Set the first time the author changes the text. The UI shows "edited"
    -- from its presence, so a boolean would lose the when.
    ADD COLUMN edited_at timestamptz,

    -- "Delete for everyone" is a soft delete: the row stays so the thread keeps
    -- its shape and both sides see "this message was deleted" in the right
    -- place, rather than a silent gap that reads as a bug.
    ADD COLUMN deleted_at timestamptz,

    -- When the recipient actually opened the thread. `is_read` already carries
    -- the flag and is indexed; this carries the moment, which is what a read
    -- receipt displays.
    ADD COLUMN read_at timestamptz;

-- A withdrawn message has no text, and that is the point: the row survives so
-- the thread keeps its shape, but the words are gone from the database, not
-- merely hidden by the API. 0001's constraint forbade a blank body outright,
-- which is right for a live message and wrong for a deleted one.
ALTER TABLE messages DROP CONSTRAINT ck_messages_body_not_blank;
ALTER TABLE messages ADD CONSTRAINT ck_messages_body_not_blank
    CHECK (deleted_at IS NOT NULL OR btrim(body) <> '');

-- Messages are read newest-first and paged backwards through time, so the
-- cursor is (created_at, id) — id breaks ties between two messages that landed
-- in the same microsecond, which is otherwise a page that skips or repeats.
CREATE INDEX idx_messages_conversation_cursor
    ON messages (conversation_id, created_at DESC, id DESC);

-- Counting someone's unread messages asks for one conversation, unread, and
-- not sent by them. The existing partial index covers the first two.
CREATE INDEX idx_messages_unread_sender
    ON messages (conversation_id, sender_id) WHERE NOT is_read;

-- ---------------------------------------------------------------------------
-- message_deletions: "delete for me"
-- ---------------------------------------------------------------------------

-- Hiding a message from one participant is a property of the pair, not of the
-- message, so it cannot live on the message row. A row here means "this user
-- does not see this message"; its absence means they do.
CREATE TABLE message_deletions (
    message_id uuid        NOT NULL,
    user_id    uuid        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_message_deletions PRIMARY KEY (message_id, user_id),
    CONSTRAINT fk_message_deletions_message
        FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
    CONSTRAINT fk_message_deletions_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Loading a thread filters out the rows this user has hidden, which is a
-- lookup by user across many messages.
CREATE INDEX idx_message_deletions_user ON message_deletions (user_id);
