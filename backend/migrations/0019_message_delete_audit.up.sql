-- 0019_message_delete_audit — who withdrew a message, and what it said.
--
-- Two changes, both for moderation. Until now a withdrawn message lost its
-- text: the repository wrote an empty body alongside `deleted_at`, so nothing
-- remained to answer "what was actually sent". That is the right default for
-- privacy and the wrong one for abuse: a threat withdrawn a minute after it
-- lands is exactly the message an owner needs to be able to read.
--
-- The text now stays in the row. It is still never returned to the two people
-- in the conversation — the response builder blanks the body of anything
-- deleted, and always did, which is what made the extra wiping redundant. Only
-- the owner's audit endpoint reads it, and that endpoint refuses everybody else.

ALTER TABLE messages
    ADD COLUMN deleted_by uuid;

ALTER TABLE messages
    ADD CONSTRAINT fk_messages_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users (id) ON DELETE SET NULL;

-- Messages withdrawn before this migration have no text left to recover and no
-- record of who withdrew them. Nothing can be back-filled; the audit view says
-- so rather than inventing a name.
COMMENT ON COLUMN messages.deleted_by IS
    'Who withdrew the message. Null for messages withdrawn before migration 0019.';
