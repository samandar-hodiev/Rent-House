-- 0025_listing_reports — what visitors report about a listing.
--
-- The dashboard has had a "complaints" section since the beginning, showing an
-- empty page and saying so: nothing could be reported, so nothing was recorded.
-- This is the missing half — the rows the section reads, and the rows the
-- moderation threshold counts.
CREATE TABLE listing_reports (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    apartment_id uuid NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,

    -- Who reported it. Signed in, always: an anonymous report cannot be
    -- answered, cannot be rate-limited, and is the easiest thing in the world
    -- to send a thousand of.
    --
    -- ON DELETE SET NULL rather than CASCADE: a report is a record of a
    -- moderation decision, and deleting the account that raised it must not
    -- erase the reason a listing was closed.
    reporter_id uuid REFERENCES users(id) ON DELETE SET NULL,

    -- Why. A closed set, so the dashboard can group and count them; the free
    -- text beside it is where anything the set does not cover goes.
    reason  varchar(30) NOT NULL,
    comment varchar(1000) NOT NULL DEFAULT '',

    status varchar(20) NOT NULL DEFAULT 'open',

    -- Who dealt with it and when. Null while it is open.
    resolved_by uuid REFERENCES admins(id) ON DELETE SET NULL,
    resolved_at timestamptz,
    -- What they decided, in their own words, for the record.
    resolution varchar(1000) NOT NULL DEFAULT '',

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_listing_reports_reason CHECK (
        reason IN ('fraud', 'wrong_info', 'unavailable', 'duplicate', 'offensive', 'other')
    ),
    CONSTRAINT ck_listing_reports_status CHECK (
        status IN ('open', 'reviewing', 'resolved', 'dismissed')
    ),
    -- A decision has an author and a date, or it has neither.
    CONSTRAINT ck_listing_reports_resolved CHECK (
        (status IN ('open', 'reviewing')) = (resolved_at IS NULL)
    )
);

-- One open report per person per listing. Reporting the same listing twice is
-- not more information, and without this a single account could raise the
-- threshold on any listing by itself.
CREATE UNIQUE INDEX uq_listing_reports_open
    ON listing_reports (apartment_id, reporter_id)
    WHERE status IN ('open', 'reviewing') AND reporter_id IS NOT NULL;

-- The dashboard's default view: what is still waiting, newest first.
CREATE INDEX idx_listing_reports_status ON listing_reports (status, created_at DESC);

-- How many a listing has, which is what the threshold counts.
CREATE INDEX idx_listing_reports_apartment ON listing_reports (apartment_id);
