-- Nothing to reverse.
--
-- 0007 recomputed a counter from the events that back it. The pre-0006 totals
-- it replaced were never recorded anywhere else, so there is no earlier value
-- to restore — and restoring one would only recreate the disagreement between
-- the card and the chart that 0007 removed.
--
-- Recomputing the same figure is idempotent and leaves the two in step, which
-- is the state a rollback should land in.
UPDATE apartments AS a
SET views_count = (
    SELECT count(*) FROM apartment_views AS v WHERE v.apartment_id = a.id
);
