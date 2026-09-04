-- 0024_refresh_tokens — sessions that can actually be ended.
--
-- Until now a session was one JWT and nothing else. That has two consequences:
-- signing out could only forget the token in the browser, because the server
-- had nothing to forget; and the token had to live long enough to be
-- convenient, which is exactly as long as a stolen one would work.
--
-- A refresh token is the server's half of the session. The access token becomes
-- short-lived and stateless as before; this row is what lets it be renewed, and
-- deleting the row is what makes "sign out" mean something.
CREATE TABLE refresh_tokens (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The token itself is never stored. What is stored is a SHA-256 of it:
    -- long random secrets do not need a slow hash, and a leaked table is then
    -- a table of useless digests. Unique, so a digest collision or a replayed
    -- insert cannot produce two live rows for one secret.
    token_hash char(64) NOT NULL,

    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    -- Set when the session ends, whether by signing out, by rotation, or by a
    -- password reset. Kept rather than deleted so a refresh presented twice can
    -- be recognised as a replay instead of merely being unknown.
    revoked_at timestamptz,
    -- Which token replaced this one, for the same reason.
    replaced_by uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,

    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);

-- Every session a user has, for revoking them all at once.
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- Sweeping what has expired.
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens (expires_at);
