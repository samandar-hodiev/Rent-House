ALTER TABLE apartments
    DROP CONSTRAINT IF EXISTS ck_apartments_type;

ALTER TABLE apartments
    DROP COLUMN IF EXISTS apartment_type;
