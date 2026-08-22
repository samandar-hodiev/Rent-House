-- 0006_apartment_views — real view events, and when a listing went live.
--
-- `apartments.views_count` has always been a bare counter: it can say a listing
-- was seen 480 times but not when, so no chart can be drawn from it. Analytics
-- needs the events themselves.
--
-- The counter stays. It is the cheap total shown on every card, kept in step
-- with the events by the same statement that inserts them.

-- ---------------------------------------------------------------------------
-- apartments: when the listing was published
-- ---------------------------------------------------------------------------

-- The analytics timeline starts here, not at created_at: a listing drafted in
-- June and published in August has no August-before audience to plot, and
-- charting the draft weeks would show empty days that were never live.
ALTER TABLE apartments
    ADD COLUMN published_at timestamptz;

-- Existing live listings have been visible since they were created — that is
-- the only publication moment this database ever recorded.
UPDATE apartments SET published_at = created_at WHERE status = 'active';

-- A listing is published exactly when it is active. Anything else would let a
-- draft claim a publication date, and the analytics range is derived from this.
ALTER TABLE apartments
    ADD CONSTRAINT ck_apartments_published_at
        CHECK ((status = 'active') = (published_at IS NOT NULL));

-- ---------------------------------------------------------------------------
-- apartment_views: one row per counted view
-- ---------------------------------------------------------------------------

CREATE TABLE apartment_views (
    id           uuid        NOT NULL DEFAULT gen_random_uuid(),
    apartment_id uuid        NOT NULL,
    -- Null for a signed-out visitor. Anonymous people browse listings and their
    -- views count; only the association with an account is missing.
    viewer_id    uuid,
    -- Who this view is *for deduplication purposes*: "u:<user id>" when signed
    -- in, otherwise a salted hash of address and user agent. Never a raw IP —
    -- the address is a means of telling two visitors apart, not something worth
    -- keeping.
    viewer_key   varchar(80) NOT NULL,
    -- The hour the view falls in, in Tashkent local time. It exists so the
    -- unique index below can express "one view per visitor per listing per
    -- hour": a reader refreshing the page ten times is one interested person,
    -- not ten.
    view_bucket  timestamptz NOT NULL,
    viewed_at    timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_apartment_views PRIMARY KEY (id),

    -- Deleting a listing removes its views: they describe that listing and
    -- nothing else, and counting views of a row that no longer exists is
    -- exactly the invalid record analytics must not report.
    CONSTRAINT fk_apartment_views_apartment
        FOREIGN KEY (apartment_id) REFERENCES apartments (id) ON DELETE CASCADE,
    -- A closed account does not erase the traffic it generated; the view stays
    -- and becomes anonymous.
    CONSTRAINT fk_apartment_views_viewer
        FOREIGN KEY (viewer_id) REFERENCES users (id) ON DELETE SET NULL
);

-- Deduplication, enforced by the database rather than by a read-then-write in
-- application code: two simultaneous requests would both find nothing and both
-- insert. INSERT ... ON CONFLICT DO NOTHING makes the whole decision atomic,
-- and its RowsAffected is what tells the caller whether to bump views_count.
CREATE UNIQUE INDEX uq_apartment_views_dedupe
    ON apartment_views (apartment_id, viewer_key, view_bucket);

-- "Every view of this listing", the per-listing analytics query.
CREATE INDEX idx_apartment_views_apartment_id ON apartment_views (apartment_id);
-- "Everything in this period", for range scans across all listings.
CREATE INDEX idx_apartment_views_viewed_at ON apartment_views (viewed_at DESC);
-- The shape the dashboard actually runs: one listing, bounded by date, grouped
-- by day. Filtering and ordering on the same index means no separate sort.
CREATE INDEX idx_apartment_views_apartment_viewed_at
    ON apartment_views (apartment_id, viewed_at DESC);
