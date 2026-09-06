-- 0029_apartment_type — what kind of place this is, not just how big.
--
-- CLAUDE.md lists "apartment type" alongside furnished and amenities as one of
-- the owner-listing fields, and again as one of the search filters — it was
-- simply never built. 'apartment' is the default because that is what this
-- marketplace has been listing exclusively until now; existing rows keep
-- meaning exactly what they always meant.
ALTER TABLE apartments
    ADD COLUMN apartment_type varchar(20) NOT NULL DEFAULT 'apartment';

ALTER TABLE apartments
    ADD CONSTRAINT ck_apartments_type CHECK (apartment_type IN ('apartment', 'house', 'room'));
