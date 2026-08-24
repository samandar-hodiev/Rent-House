-- Listings already in `deleted` have no older state to return to, and the
-- constraint would refuse them. They become drafts: unpublished and owner-only,
-- which is the closest thing the narrower vocabulary can express.
UPDATE apartments SET status = 'draft', published_at = NULL WHERE status = 'deleted';

ALTER TABLE apartments DROP CONSTRAINT ck_apartments_status;

ALTER TABLE apartments
    ADD CONSTRAINT ck_apartments_status
        CHECK (status IN ('draft', 'pending', 'active', 'closed'));
