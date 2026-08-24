-- 0014_apartment_deleted_status — removing a listing keeps it.
--
-- "Delete" used to remove the row. That takes with it everything that pointed
-- at it: the messages people wrote about it, the view history behind its
-- analytics, somebody's saved listing. It is also unrecoverable by an owner who
-- meant to close a listing rather than erase it.
--
-- `deleted` becomes a state like any other. The listing stops being public, its
-- owner can still see it under "O'chirilgan", and nothing that referred to it
-- breaks.

ALTER TABLE apartments DROP CONSTRAINT ck_apartments_status;

ALTER TABLE apartments
    ADD CONSTRAINT ck_apartments_status
        CHECK (status IN ('draft', 'pending', 'active', 'closed', 'deleted'));

-- `ck_apartments_published_at` already says a listing has a publication date
-- exactly when it is active, so a listing moved to `deleted` must lose that
-- date — which is what the service does on every transition. Nothing to change
-- here; noted so the pairing is not rediscovered later.
