DROP INDEX IF EXISTS idx_site_settings_category;

ALTER TABLE site_settings
    DROP CONSTRAINT IF EXISTS ck_site_settings_value_type;

UPDATE site_settings SET key = 'require_moderation' WHERE key = 'listing_moderation_required';
UPDATE site_settings SET key = 'max_images'         WHERE key = 'listing_max_images';

-- Keys that only exist under the registry have nowhere to go in the old shape.
DELETE FROM site_settings WHERE key NOT IN ('require_moderation', 'max_images');

ALTER TABLE site_settings
    DROP COLUMN IF EXISTS value_type,
    DROP COLUMN IF EXISTS category,
    DROP COLUMN IF EXISTS updated_by,
    DROP COLUMN IF EXISTS created_at;
