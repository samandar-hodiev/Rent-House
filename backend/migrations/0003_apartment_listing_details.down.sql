-- Reverses 0003. Dropping the columns drops their constraints with them, but
-- the indexes are named separately and have to go explicitly.

DROP INDEX IF EXISTS idx_apartments_owner_created_at;

ALTER TABLE apartments
    DROP COLUMN IF EXISTS rules,
    DROP COLUMN IF EXISTS minimum_months,
    DROP COLUMN IF EXISTS utilities,
    DROP COLUMN IF EXISTS deposit,
    DROP COLUMN IF EXISTS neighborhood;
