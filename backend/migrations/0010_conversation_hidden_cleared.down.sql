-- Reverses 0010 by collapsing the two meanings back into one column.
--
-- hidden_at is the one kept: it is what "delete for me" set, and the state the
-- single column described. A thread that was only cleared — reopened after
-- being withdrawn — becomes an ordinary visible thread again, which is the
-- closest the old schema can come to describing it.

ALTER TABLE conversation_participants ADD COLUMN deleted_at timestamptz;

UPDATE conversation_participants SET deleted_at = hidden_at WHERE hidden_at IS NOT NULL;

DROP INDEX IF EXISTS idx_conversation_participants_hidden;

ALTER TABLE conversation_participants
    DROP COLUMN cleared_at,
    DROP COLUMN hidden_at;

CREATE INDEX idx_conversation_participants_deleted
    ON conversation_participants (user_id)
    WHERE deleted_at IS NOT NULL;
