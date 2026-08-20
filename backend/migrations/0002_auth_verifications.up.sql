-- 0002_auth_verifications — OTP-based registration.
--
-- Two changes:
--   1. A user now registers with a phone OR an email, so neither column can be
--      NOT NULL any more. A CHECK keeps at least one of them present, and the
--      existing UNIQUE constraints still hold — PostgreSQL treats NULLs as
--      distinct, so many phone-only accounts can coexist with a NULL email.
--   2. A table for verification codes, which owns the whole registration
--      session: the hashed OTP, its attempt counter, and the short-lived token
--      handed out once the code is accepted.

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- An account with neither contact could never sign in again.
ALTER TABLE users ADD CONSTRAINT ck_users_contact_present
    CHECK (email IS NOT NULL OR phone IS NOT NULL);

CREATE TABLE auth_verifications (
    id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL during registration: the account does not exist yet. Present for
    -- later purposes such as password reset, which reuse this table.
    user_id uuid,

    purpose varchar(20) NOT NULL,
    method  varchar(10) NOT NULL,
    phone   varchar(32),
    email   varchar(255),

    -- The bcrypt hash of the six-digit code. The code itself is never stored,
    -- so a database leak does not hand over live OTPs.
    code_hash varchar(255) NOT NULL,

    attempts   smallint    NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL,

    -- Set when the correct code is entered. Until then the row cannot be
    -- exchanged for a registration token.
    verified_at timestamptz,

    -- Set when the row has been spent — either the registration completed or a
    -- newer code superseded it. A consumed row is never accepted again, which
    -- is what makes both the OTP and the token single-use.
    consumed_at timestamptz,

    -- SHA-256 of the registration token issued after a successful check. The
    -- token has 256 bits of entropy, so a fast hash is enough; bcrypt here
    -- would only slow down every completion request.
    registration_token_hash       varchar(64),
    registration_token_expires_at timestamptz,

    -- Drives the resend cooldown.
    last_sent_at timestamptz NOT NULL DEFAULT now(),

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_auth_verifications_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,

    CONSTRAINT ck_auth_verifications_purpose CHECK (purpose IN ('registration', 'password_reset')),
    CONSTRAINT ck_auth_verifications_method  CHECK (method IN ('phone', 'email')),
    CONSTRAINT ck_auth_verifications_attempts CHECK (attempts >= 0),

    -- The method decides which contact column is filled; the other must be
    -- empty, so a row can never be ambiguous about where the code was sent.
    CONSTRAINT ck_auth_verifications_contact CHECK (
        (method = 'phone' AND phone IS NOT NULL AND email IS NULL) OR
        (method = 'email' AND email IS NOT NULL AND phone IS NULL)
    ),

    -- A token and its expiry are set together or not at all.
    CONSTRAINT ck_auth_verifications_token CHECK (
        (registration_token_hash IS NULL AND registration_token_expires_at IS NULL) OR
        (registration_token_hash IS NOT NULL AND registration_token_expires_at IS NOT NULL)
    )
);

-- Looking up the live verification for a contact: the cooldown check on
-- request, and superseding an older code when a new one is sent.
CREATE INDEX idx_auth_verifications_phone
    ON auth_verifications (purpose, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_auth_verifications_email
    ON auth_verifications (purpose, email) WHERE email IS NOT NULL;

-- Exchanging a registration token for an account. Unique so two rows can never
-- answer to the same token; partial so the many NULLs do not collide.
CREATE UNIQUE INDEX uq_auth_verifications_token
    ON auth_verifications (registration_token_hash) WHERE registration_token_hash IS NOT NULL;

-- Supports the cleanup sweep for rows that are long dead.
CREATE INDEX idx_auth_verifications_expires_at ON auth_verifications (expires_at);

CREATE INDEX idx_auth_verifications_user_id
    ON auth_verifications (user_id) WHERE user_id IS NOT NULL;
