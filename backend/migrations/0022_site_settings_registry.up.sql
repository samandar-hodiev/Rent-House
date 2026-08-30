-- 0022_site_settings_registry — the configuration table, grown up.
--
-- 0021 introduced two settings. This turns the same table into the marketplace's
-- whole configuration: what type a value is, which card of the dashboard it
-- belongs to, and which administrator last changed it.
--
-- Only values that have actually been set are stored. Defaults live with the
-- declarations in internal/models/site_setting.go, so a fresh database and a
-- long-running one behave identically, and there is no second copy of every
-- default here to drift out of step with the code that reads it.
ALTER TABLE site_settings
    ADD COLUMN value_type varchar(10) NOT NULL DEFAULT 'string',
    ADD COLUMN category   varchar(30) NOT NULL DEFAULT 'general',
    -- Who changed it last. Nullable and ON DELETE SET NULL: an administrator
    -- can be removed, and the configuration they left behind must survive it.
    ADD COLUMN updated_by uuid REFERENCES admins(id) ON DELETE SET NULL,
    ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

-- The two keys 0021 created, renamed into the registry's naming scheme so every
-- listing setting reads as one family. Values are carried over: an owner who
-- switched moderation on keeps it on.
UPDATE site_settings SET key = 'listing_moderation_required',
       value_type = 'boolean', category = 'listings'
 WHERE key = 'require_moderation';

UPDATE site_settings SET key = 'listing_max_images',
       value_type = 'integer', category = 'listings'
 WHERE key = 'max_images';

ALTER TABLE site_settings
    ADD CONSTRAINT ck_site_settings_value_type
        CHECK (value_type IN ('string', 'integer', 'boolean', 'json'));

-- The dashboard reads one category at a time when a section is saved.
CREATE INDEX idx_site_settings_category ON site_settings (category);
