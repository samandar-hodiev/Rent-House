-- 0020_admin_audit_logs — what administrators did.
--
-- The dashboard had an audit page from the start, filled with invented rows.
-- Nothing was recording anything, so the page could only ever be a mock-up.
-- This is the missing half: one row per action an administrator takes.
--
-- Deliberately narrow. It records the actions this dashboard performs — signing
-- in, creating or removing an administrator, blocking a marketplace account,
-- changing what the sidebar offers — and not page views, which would bury the
-- few rows that matter under thousands that do not.
CREATE TABLE admin_audit_logs (
    id       uuid        NOT NULL DEFAULT gen_random_uuid(),
    -- Nullable: removing an administrator must not erase the record of what
    -- they did. The name is kept alongside for the same reason.
    admin_id   uuid,
    admin_name varchar(200) NOT NULL,

    action varchar(60)  NOT NULL,
    -- What the action was aimed at, in words — an email, a listing title, a
    -- section name. Free text because the targets are of different kinds and a
    -- foreign key could only point at one of them.
    target varchar(300) NOT NULL DEFAULT '',
    -- Where the request came from, as the server saw it.
    ip     varchar(64)  NOT NULL DEFAULT '',
    -- "success" or "failed". A refused sign-in is worth recording.
    status varchar(20)  NOT NULL DEFAULT 'success',

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_admin_audit_logs PRIMARY KEY (id),
    CONSTRAINT ck_admin_audit_logs_status CHECK (status IN ('success', 'failed')),
    CONSTRAINT fk_admin_audit_logs_admin
        FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE SET NULL
);

-- The page reads it newest first, and that is the only way it is read.
CREATE INDEX idx_admin_audit_logs_created ON admin_audit_logs (created_at DESC);
