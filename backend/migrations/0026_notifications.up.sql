-- 0026_notifications — the dashboard's notification feed, and the marketplace's.
--
-- The admin section has existed since the beginning, showing an empty page and
-- saying plainly that nothing generated notifications. This is what generates
-- them, and what a person reads afterwards.
--
-- One table for both audiences. They are the same thing — something happened,
-- somebody should know — and two tables would mean two of every query, two
-- read-state columns and two ways to be wrong about which is which.
CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who is being told. An administrator or a marketplace account; the two
    -- live in separate tables, so the reference is by type and id rather than
    -- by two nullable foreign keys.
    audience     varchar(10) NOT NULL,
    recipient_id uuid        NOT NULL,

    -- What happened. The text is not stored: it is rendered from this type and
    -- the payload below, in whatever language the reader has chosen. Storing a
    -- sentence would freeze it in the language of the moment it was created.
    type    varchar(40) NOT NULL,
    payload jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- What it is about, so the notification can link somewhere.
    entity_type varchar(20) NOT NULL DEFAULT '',
    entity_id   uuid,

    read_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_notifications_audience CHECK (audience IN ('admin', 'user'))
);

-- The feed itself: one recipient's notifications, newest first.
CREATE INDEX idx_notifications_recipient
    ON notifications (audience, recipient_id, created_at DESC);

-- The unread badge, which is asked for on every page load.
CREATE INDEX idx_notifications_unread
    ON notifications (audience, recipient_id)
    WHERE read_at IS NULL;
