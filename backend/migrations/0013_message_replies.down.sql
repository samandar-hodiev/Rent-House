DROP INDEX idx_messages_reply_to;

ALTER TABLE messages
    DROP CONSTRAINT ck_messages_reply_not_self,
    DROP CONSTRAINT fk_messages_reply_to,
    DROP COLUMN reply_to_message_id;
