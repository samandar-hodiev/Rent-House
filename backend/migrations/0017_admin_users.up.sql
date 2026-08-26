-- 0017_admin_users — what an administrator can change about an account, and
-- what an administrator's own account looks like.

-- Whether a marketplace account may be used at all.
--
-- Separate from `user_blocks`, which is one member refusing to hear from
-- another. This is the marketplace refusing the account: it stops sign-in
-- outright, and only an administrator can set or lift it.
ALTER TABLE users
    ADD COLUMN status varchar(20) NOT NULL DEFAULT 'active';

ALTER TABLE users
    ADD CONSTRAINT ck_users_status CHECK (status IN ('active', 'blocked'));

-- The admin list filters on it and it has low cardinality, so a partial index
-- on the rare value is worth more than a full one: blocked accounts are the
-- few, and "show me the blocked ones" is the query that needs help.
CREATE INDEX idx_users_blocked ON users (created_at DESC) WHERE status = 'blocked';

-- An administrator's own picture. Same storage as everything else uploaded —
-- a path served by the API, never a binary in a column.
ALTER TABLE admins
    ADD COLUMN avatar_url text;
