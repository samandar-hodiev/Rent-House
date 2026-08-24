-- 0013_message_replies — a message can answer another message.
--
-- The relationship is stored rather than implied by adjacency: "↳ Bu uy hali
-- bo'shmi?" has to keep pointing at the message it answers even after other
-- messages arrive between them, and after either person scrolls far enough back
-- that the original is not on screen.

ALTER TABLE messages
    ADD COLUMN reply_to_message_id uuid,
    -- SET NULL rather than CASCADE: withdrawing a message must not take the
    -- replies to it with it. The reply is somebody else's words and stays;
    -- it simply stops quoting.
    ADD CONSTRAINT fk_messages_reply_to
        FOREIGN KEY (reply_to_message_id) REFERENCES messages (id) ON DELETE SET NULL,
    -- A message answering itself is a cycle with nothing to render.
    ADD CONSTRAINT ck_messages_reply_not_self
        CHECK (reply_to_message_id IS NULL OR reply_to_message_id <> id);

-- Loading a page of messages resolves each one's quoted original, so the
-- lookup is by the column being pointed at.
CREATE INDEX idx_messages_reply_to
    ON messages (reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;
