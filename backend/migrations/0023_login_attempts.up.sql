-- 0023_login_attempts — failed sign-ins, so a lockout can be enforced.
--
-- The settings page offers "maximum login attempts" and "lock duration". Those
-- can only mean something if failures are counted somewhere that survives a
-- restart and is shared by every instance of the server, which rules out
-- counting them in memory.
--
-- Rows are keyed by the identifier that was typed, not by the account it
-- resolves to: an account that does not exist must lock out the same way, or
-- the lockout itself becomes a way to learn which addresses are registered.
CREATE TABLE login_attempts (
    identifier   varchar(255) NOT NULL,
    failures     integer      NOT NULL DEFAULT 0,
    -- When the current streak of failures began, and when the lock lifts.
    -- Nullable: an identifier with failures but no lock is somebody who
    -- mistyped once.
    locked_until timestamptz,
    updated_at   timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT pk_login_attempts PRIMARY KEY (identifier),
    CONSTRAINT ck_login_attempts_failures CHECK (failures >= 0)
);

-- Sweeping old rows: an identifier nobody has failed on for a day is not
-- interesting, and this keeps the table proportional to recent activity.
CREATE INDEX idx_login_attempts_updated ON login_attempts (updated_at);
