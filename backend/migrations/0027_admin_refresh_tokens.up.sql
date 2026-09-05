-- 0027_admin_refresh_tokens — sessions the dashboard can actually end.
--
-- Signing in to the admin dashboard has only ever minted one stateless JWT: no
-- row on the server remembers it, so "sign out" meant nothing beyond the
-- browser forgetting a token, and a token that leaked was good for the whole
-- of its (long) lifetime.
--
-- This mirrors 0024_refresh_tokens exactly, but for admins rather than users.
-- A separate table rather than a shared one: the two are already separate
-- systems with separate accounts and separate token audiences, and a session
-- table with an audience column would let a bug in one flow revoke or renew a
-- session that belongs to the other.
CREATE TABLE admin_refresh_tokens (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,

    -- As in refresh_tokens: only a SHA-256 digest of the secret is stored.
    token_hash char(64) NOT NULL,

    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    revoked_at timestamptz,
    replaced_by uuid REFERENCES admin_refresh_tokens(id) ON DELETE SET NULL,

    CONSTRAINT uq_admin_refresh_tokens_hash UNIQUE (token_hash)
);

CREATE INDEX idx_admin_refresh_tokens_admin ON admin_refresh_tokens (admin_id) WHERE revoked_at IS NULL;

CREATE INDEX idx_admin_refresh_tokens_expires ON admin_refresh_tokens (expires_at);
