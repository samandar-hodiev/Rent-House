-- 0003_apartment_listing_details — the listing fields the owner form collects
-- but the table had nowhere to put.
--
-- 0001 modelled an apartment as a searchable object: what it is, where it is,
-- what it costs. The owner-facing form also collects how it is let — the
-- deposit, who pays the utilities, the shortest term accepted, and the house
-- rules — plus the neighbourhood, which is finer-grained than a district and is
-- what people actually search by ("Chilonzor, Qatortol").
--
-- Until now those five answers were typed into the form and dropped. They are
-- part of the listing, so they belong on the row.
--
-- Everything here is nullable or defaulted: existing rows stay valid, and the
-- optional parts of the form remain optional.

ALTER TABLE apartments
    -- Free text rather than a lookup table: neighbourhood names in Tashkent are
    -- informal and overlapping, and a fixed list would be wrong within a month.
    ADD COLUMN neighborhood varchar(120),

    -- Same currency and scale as `price`, which is the only sensible reading of
    -- a deposit. NULL means the owner did not ask for one.
    ADD COLUMN deposit numeric(14, 2),

    -- Who pays for gas, water and electricity on top of the rent.
    ADD COLUMN utilities varchar(10) NOT NULL DEFAULT 'INCLUDED',

    -- Shortest term the owner will accept, in months. NULL means no minimum.
    ADD COLUMN minimum_months smallint,

    -- House rules as stable slugs ('no-smoking', 'no-pets', ...). A text[] keeps
    -- the set on the row it describes; a join table would add a relation whose
    -- only purpose is to store a handful of flags, and these are never queried
    -- independently of their listing.
    ADD COLUMN rules text[] NOT NULL DEFAULT '{}';

-- Mirrored by the constants in internal/models, so a bad value cannot arrive
-- through the API or through a direct SQL insert.
ALTER TABLE apartments
    ADD CONSTRAINT ck_apartments_utilities
        CHECK (utilities IN ('INCLUDED', 'SEPARATE')),
    -- NULL is allowed; a stated deposit must be a real amount.
    ADD CONSTRAINT ck_apartments_deposit
        CHECK (deposit IS NULL OR deposit >= 0),
    -- A minimum of zero months is not a minimum. The upper bound stops a typo
    -- from producing a listing no one can rent.
    ADD CONSTRAINT ck_apartments_minimum_months
        CHECK (minimum_months IS NULL OR (minimum_months > 0 AND minimum_months <= 60));

-- The owner's dashboard lists one owner's listings newest-first. 0001 already
-- covers the public feed with idx_apartments_status_created_at; this is the
-- same shape narrowed to an owner, so the dashboard never sorts the table.
CREATE INDEX idx_apartments_owner_created_at ON apartments (owner_id, created_at DESC);
