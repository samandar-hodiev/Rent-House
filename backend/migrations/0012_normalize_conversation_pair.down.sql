-- Restores the ordered pair constraint.
--
-- Only the constraint is reversible. The merge is not: once two threads are one
-- thread, the messages that moved carry no record of which row they came from,
-- and inventing a split would be worse than leaving them together. Reverting
-- therefore leaves the merged conversations merged — which is safe, because a
-- merged thread satisfies the ordered constraint just as well.

DROP INDEX uq_conversations_pair;

ALTER TABLE conversations
    ADD CONSTRAINT uq_conversations_pair UNIQUE (buyer_id, owner_id);
