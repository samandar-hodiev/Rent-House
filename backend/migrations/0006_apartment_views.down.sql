-- Reverses 0006. Dropping apartment_views discards the recorded view history;
-- `apartments.views_count` survives, so the totals on the cards are unaffected.

DROP TABLE IF EXISTS apartment_views;

ALTER TABLE apartments DROP CONSTRAINT IF EXISTS ck_apartments_published_at;
ALTER TABLE apartments DROP COLUMN IF EXISTS published_at;
