-- 0021_site_settings — the marketplace's own configuration.
--
-- The settings page existed from the start as a form that saved nothing: every
-- switch was a default that reset on reload, and none of them changed how the
-- marketplace behaved. This is the missing half.
--
-- Key/value rather than a column per setting: settings come and go with
-- features, and a migration for each would be a migration for every checkbox.
-- The value is text and the service parses it, because the set is small and one
-- table beats one per type.
CREATE TABLE site_settings (
    key        varchar(60) NOT NULL,
    value      text        NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_site_settings PRIMARY KEY (key)
);

-- The defaults the marketplace has behaved by until now, written down so the
-- page has something to show and "reset" has something to reset to.
--
-- `require_moderation` is false because that is how listings have always
-- worked here: publishing puts a listing straight in front of the public. An
-- owner switching it on changes that for every listing published afterwards.
INSERT INTO site_settings (key, value) VALUES
    ('require_moderation', 'false'),
    ('max_images', '20');
