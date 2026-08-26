-- 0016_admins — the people who run the marketplace, kept apart from the people
-- who use it.
--
-- A separate table rather than a role column on `users`. The two are different
-- populations with different ways in: a visitor registers themselves by proving
-- a phone or an email, while an administrator can only be created by the owner.
-- Sharing one table would mean the public registration endpoint writes rows
-- that the admin authorization then has to be careful about, and one mistake
-- there is a privilege escalation. Two tables cannot make that mistake.

CREATE TABLE admins (
    id            uuid         NOT NULL DEFAULT gen_random_uuid(),
    name          varchar(200) NOT NULL,
    email         varchar(255) NOT NULL,

    -- bcrypt output. Never the password itself, and never returned by any
    -- endpoint — see the DTOs, which are built field by field.
    password_hash varchar(255) NOT NULL,

    role          varchar(20)  NOT NULL,
    status        varchar(20)  NOT NULL DEFAULT 'active',

    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    -- Null until they have signed in once.
    last_login_at timestamptz,

    CONSTRAINT pk_admins PRIMARY KEY (id),
    CONSTRAINT uq_admins_email UNIQUE (email),

    CONSTRAINT ck_admins_role   CHECK (role IN ('owner', 'super_admin')),
    CONSTRAINT ck_admins_status CHECK (status IN ('active', 'inactive', 'suspended'))
);

-- One owner, enforced by the database.
--
-- The service refuses to create a second one too, but a check in application
-- code has a race window where two concurrent requests both pass it. A partial
-- unique index has no such window: the second insert fails, whatever the
-- application believed.
CREATE UNIQUE INDEX uq_admins_single_owner ON admins ((role)) WHERE role = 'owner';

-- Sign-in looks accounts up by address, and the address is stored lowercased so
-- one person cannot hold two accounts differing only in case.
CREATE INDEX idx_admins_status ON admins (status);

-- Which sections of the dashboard a non-owner is offered.
--
-- Rows, not a JSON blob: each section is a row that can be granted or revoked
-- on its own, and the authorization middleware reads one row rather than
-- parsing a document. The owner is never subject to it — see the service.
CREATE TABLE admin_sidebar_sections (
    section    varchar(40) NOT NULL,
    enabled    boolean     NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_admin_sidebar_sections PRIMARY KEY (section)
);

-- The defaults the dashboard has always started from. Seeded here so a fresh
-- database behaves like a configured one, and so "restore defaults" has
-- something to restore to.
INSERT INTO admin_sidebar_sections (section, enabled) VALUES
    ('dashboard',       true),
    ('users',           true),
    ('listings',        true),
    ('chats',           true),
    ('reports',         true),
    ('analytics',       true),
    ('notifications',   true),
    ('adminManagement', false),
    ('auditLogs',       false),
    ('settings',        false);
