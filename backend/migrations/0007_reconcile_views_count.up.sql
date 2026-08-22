-- 0007_reconcile_views_count — make the counter agree with the events.
--
-- `apartments.views_count` predates 0006. Until that migration it was the only
-- record of a view: a number incremented on every read, with no history behind
-- it. 0006 introduced `apartment_views`, and from that point the two are
-- written in the same transaction and cannot drift.
--
-- What they cannot do is agree about the past. A listing carrying 14 from
-- before 0006 has no events to show for them, so the card said "14 ta ko'rish"
-- while the chart — reading the events — drew nothing. One listing, two
-- numbers, and the larger one unverifiable.
--
-- The events are the record. The counter is reset to match them, which is the
-- only value both can be read from consistently. This discards pre-0006
-- totals: they cannot be dated, attributed, or shown on any chart, and keeping
-- them would mean permanently explaining why two figures disagree.
UPDATE apartments AS a
SET views_count = (
    SELECT count(*) FROM apartment_views AS v WHERE v.apartment_id = a.id
);
