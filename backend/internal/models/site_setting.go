package models

// The marketplace's configuration, defined once.
//
// Every setting is declared here — its type, its category, its default and what
// counts as a valid value — and every other layer reads that declaration rather
// than restating it. The service validates against it, the migration seeds from
// it, and the dashboard groups its cards by the categories below. A setting
// added here needs no second edit anywhere else to be stored and validated.
//
// The rule for what belongs here: a setting exists only if some code path
// obeys it. A switch that saves but changes nothing is worse than a missing
// one, because it tells an owner the marketplace is configured a way it is not.

// SettingType is how a stored value is parsed. Values are held as text — the
// set is small and one table beats one per type — so the type says how to read
// the text back.
type SettingType string

const (
	SettingBool   SettingType = "boolean"
	SettingInt    SettingType = "integer"
	SettingString SettingType = "string"
	// SettingJSON is a JSON document; today only arrays of short tokens, such
	// as the accepted image formats.
	SettingJSON SettingType = "json"
)

// The cards the dashboard draws, in the order it draws them.
const (
	CategoryGeneral      = "general"
	CategoryLocalization = "localization"
	CategoryMaintenance  = "maintenance"
	CategoryListings     = "listings"
	CategoryModeration   = "moderation"
	CategoryUsers        = "users"
	CategoryChat         = "chat"
	CategoryMedia        = "media"
	CategorySecurity     = "security"
	CategorySystem       = "system"
)

// SettingCategories is the display order. A category absent from this list is
// not shown, which is the check that keeps the page and the registry in step.
var SettingCategories = []string{
	CategoryGeneral, CategoryLocalization, CategoryMaintenance,
	CategoryListings, CategoryModeration, CategoryUsers,
	CategoryChat, CategoryMedia, CategorySecurity, CategorySystem,
}

// SettingDef declares one setting.
type SettingDef struct {
	Key      string
	Type     SettingType
	Category string
	// Default is the value the marketplace behaves by when the row has never
	// been written. Every default is how the product already behaved before it
	// was configurable, so seeding changes nothing on its own.
	Default string

	// Min and Max bound an integer. Options, when set, is the closed set a
	// value must come from — for an integer setting the options are numbers,
	// for a string setting they are the accepted words, and for a JSON array
	// they are the accepted members.
	Min, Max int64
	MaxLen   int
	Options  []string
}

// Setting keys. Named constants rather than literals, so a typo in a service is
// a compile error instead of a silently missing setting.
const (
	SettingSiteName        = "site_name"
	SettingSiteDescription = "site_description"
	SettingSiteLogoURL     = "site_logo_url"
	SettingSiteFaviconURL  = "site_favicon_url"

	SettingDefaultLanguage = "default_language"
	SettingDefaultCurrency = "default_currency"
	SettingDateFormat      = "date_format"
	SettingTimeFormat      = "time_format"

	SettingMaintenanceMode    = "maintenance_mode"
	SettingMaintenanceMessage = "maintenance_message"

	SettingListingModerationRequired     = "listing_moderation_required"
	SettingListingMaxImages              = "listing_max_images"
	SettingListingMaxTitleLength         = "listing_max_title_length"
	SettingListingMaxDescriptionLength   = "listing_max_description_length"
	SettingListingExpirationDays         = "listing_expiration_days"
	SettingListingAutoExpire             = "listing_auto_expire"
	SettingListingOwnerCanEdit           = "listing_owner_can_edit"
	SettingListingOwnerCanDelete         = "listing_owner_can_delete"
	SettingListingRepublishAllowed       = "listing_republish_allowed"
	SettingListingEditModerationRequired = "listing_edit_moderation_required"

	SettingBlockReasonRequired = "block_reason_required"
	SettingBlockListingsAction = "block_listings_action"

	SettingUserRegistrationEnabled    = "user_registration_enabled"
	SettingRegistrationEmailEnabled   = "registration_email_enabled"
	SettingRegistrationPhoneEnabled   = "registration_phone_enabled"
	SettingUserAvatarRequired         = "user_avatar_required"
	SettingUserProfileEditEnabled     = "user_profile_edit_enabled"
	SettingBlockedContactReuseAllowed = "blocked_contact_reuse_allowed"

	SettingChatEnabled          = "chat_enabled"
	SettingUserMessagingEnabled = "user_messaging_enabled"
	SettingContactOwnerEnabled  = "contact_owner_enabled"
	SettingMessageMaxLength     = "message_max_length"
	SettingMessageEditAllowed   = "message_edit_allowed"
	SettingMessageDeleteAllowed = "message_delete_allowed"

	SettingMediaMaxImageMB          = "media_max_image_mb"
	SettingMediaAllowedImageFormats = "media_allowed_image_formats"
	SettingMediaMaxAvatarMB         = "media_max_avatar_mb"
	SettingMediaMaxListingImageMB   = "media_max_listing_image_mb"
	SettingMediaImageCompression    = "media_image_compression"
	SettingMediaUploadQuality       = "media_upload_quality"

	SettingJWTExpirationHours    = "jwt_expiration_hours"
	SettingLoginMaxAttempts      = "login_max_attempts"
	SettingLoginLockMinutes      = "login_lock_minutes"
	SettingPasswordMinLength     = "password_min_length"
	SettingPasswordRequireStrong = "password_require_strong"
	SettingAllowMultipleSessions = "allow_multiple_sessions"

	SettingTimezone              = "timezone"
	SettingDefaultCountry        = "default_country"
	SettingDefaultCity           = "default_city"
	SettingPaginationDefaultSize = "pagination_default_size"
)

// Values the closed-set settings accept.
const (
	BlockListingsKeep     = "keep"
	BlockListingsClose    = "close"
	BlockListingsModerate = "moderate"
)

// SettingDefs is every setting the marketplace has.
var SettingDefs = []SettingDef{
	// General ---------------------------------------------------------------
	{Key: SettingSiteName, Type: SettingString, Category: CategoryGeneral,
		Default: "RentHouse", MaxLen: 60},
	{Key: SettingSiteDescription, Type: SettingString, Category: CategoryGeneral,
		Default: "Toshkent shahrida uy-joy ijarasi uchun platforma.", MaxLen: 300},
	{Key: SettingSiteLogoURL, Type: SettingString, Category: CategoryGeneral,
		Default: "", MaxLen: 2048},
	{Key: SettingSiteFaviconURL, Type: SettingString, Category: CategoryGeneral,
		Default: "", MaxLen: 2048},

	// Language and formats --------------------------------------------------
	{Key: SettingDefaultLanguage, Type: SettingString, Category: CategoryLocalization,
		Default: "uz", Options: []string{"uz", "ru", "en"}},
	{Key: SettingDefaultCurrency, Type: SettingString, Category: CategoryLocalization,
		Default: "UZS", Options: []string{"UZS", "USD"}},
	{Key: SettingDateFormat, Type: SettingString, Category: CategoryLocalization,
		Default: "DD.MM.YYYY", Options: []string{"DD.MM.YYYY", "YYYY-MM-DD"}},
	{Key: SettingTimeFormat, Type: SettingString, Category: CategoryLocalization,
		Default: "24", Options: []string{"24", "12"}},

	// Maintenance -----------------------------------------------------------
	{Key: SettingMaintenanceMode, Type: SettingBool, Category: CategoryMaintenance,
		Default: "false"},
	{Key: SettingMaintenanceMessage, Type: SettingString, Category: CategoryMaintenance,
		Default: "Saytda texnik ishlar olib borilmoqda. Tez orada qaytamiz.", MaxLen: 500},

	// Listings --------------------------------------------------------------
	{Key: SettingListingModerationRequired, Type: SettingBool, Category: CategoryListings,
		Default: "false"},
	{Key: SettingListingMaxImages, Type: SettingInt, Category: CategoryListings,
		Default: "20", Min: 1, Max: 50},
	{Key: SettingListingMaxTitleLength, Type: SettingInt, Category: CategoryListings,
		Default: "255", Min: 20, Max: 255},
	{Key: SettingListingMaxDescriptionLength, Type: SettingInt, Category: CategoryListings,
		Default: "5000", Min: 100, Max: 5000},
	{Key: SettingListingExpirationDays, Type: SettingInt, Category: CategoryListings,
		Default: "30", Options: []string{"7", "14", "30", "60", "90"}},
	{Key: SettingListingAutoExpire, Type: SettingBool, Category: CategoryListings,
		Default: "false"},
	{Key: SettingListingOwnerCanEdit, Type: SettingBool, Category: CategoryListings,
		Default: "true"},
	{Key: SettingListingOwnerCanDelete, Type: SettingBool, Category: CategoryListings,
		Default: "true"},
	{Key: SettingListingRepublishAllowed, Type: SettingBool, Category: CategoryListings,
		Default: "true"},

	// Moderation ------------------------------------------------------------
	{Key: SettingListingEditModerationRequired, Type: SettingBool, Category: CategoryModeration,
		Default: "true"},
	{Key: SettingBlockReasonRequired, Type: SettingBool, Category: CategoryModeration,
		Default: "true"},
	{Key: SettingBlockListingsAction, Type: SettingString, Category: CategoryModeration,
		Default: BlockListingsKeep,
		Options: []string{BlockListingsKeep, BlockListingsClose, BlockListingsModerate}},

	// Accounts --------------------------------------------------------------
	{Key: SettingUserRegistrationEnabled, Type: SettingBool, Category: CategoryUsers,
		Default: "true"},
	{Key: SettingRegistrationEmailEnabled, Type: SettingBool, Category: CategoryUsers,
		Default: "true"},
	{Key: SettingRegistrationPhoneEnabled, Type: SettingBool, Category: CategoryUsers,
		Default: "true"},
	{Key: SettingUserAvatarRequired, Type: SettingBool, Category: CategoryUsers,
		Default: "false"},
	{Key: SettingUserProfileEditEnabled, Type: SettingBool, Category: CategoryUsers,
		Default: "true"},
	{Key: SettingBlockedContactReuseAllowed, Type: SettingBool, Category: CategoryUsers,
		Default: "false"},

	// Chat ------------------------------------------------------------------
	{Key: SettingChatEnabled, Type: SettingBool, Category: CategoryChat, Default: "true"},
	{Key: SettingUserMessagingEnabled, Type: SettingBool, Category: CategoryChat,
		Default: "true"},
	{Key: SettingContactOwnerEnabled, Type: SettingBool, Category: CategoryChat,
		Default: "true"},
	{Key: SettingMessageMaxLength, Type: SettingInt, Category: CategoryChat,
		Default: "4000", Min: 1, Max: 10000},
	{Key: SettingMessageEditAllowed, Type: SettingBool, Category: CategoryChat,
		Default: "true"},
	{Key: SettingMessageDeleteAllowed, Type: SettingBool, Category: CategoryChat,
		Default: "true"},

	// Media -----------------------------------------------------------------
	{Key: SettingMediaMaxImageMB, Type: SettingInt, Category: CategoryMedia,
		Default: "5", Min: 1, Max: 25},
	{Key: SettingMediaAllowedImageFormats, Type: SettingJSON, Category: CategoryMedia,
		Default: `["jpg","png","webp"]`, Options: []string{"jpg", "png", "webp", "gif"}},
	{Key: SettingMediaMaxAvatarMB, Type: SettingInt, Category: CategoryMedia,
		Default: "2", Min: 1, Max: 10},
	{Key: SettingMediaMaxListingImageMB, Type: SettingInt, Category: CategoryMedia,
		Default: "5", Min: 1, Max: 25},
	{Key: SettingMediaImageCompression, Type: SettingBool, Category: CategoryMedia,
		Default: "false"},
	{Key: SettingMediaUploadQuality, Type: SettingInt, Category: CategoryMedia,
		Default: "82", Min: 40, Max: 100},

	// Security --------------------------------------------------------------
	{Key: SettingJWTExpirationHours, Type: SettingInt, Category: CategorySecurity,
		Default: "24", Min: 1, Max: 720},
	{Key: SettingLoginMaxAttempts, Type: SettingInt, Category: CategorySecurity,
		Default: "5", Min: 3, Max: 20},
	{Key: SettingLoginLockMinutes, Type: SettingInt, Category: CategorySecurity,
		Default: "15", Min: 1, Max: 1440},
	{Key: SettingPasswordMinLength, Type: SettingInt, Category: CategorySecurity,
		// 72 is bcrypt's own ceiling: bytes past it are ignored, so a longer
		// minimum would promise strength the algorithm does not read.
		Default: "8", Min: 6, Max: 72},
	{Key: SettingPasswordRequireStrong, Type: SettingBool, Category: CategorySecurity,
		Default: "false"},
	{Key: SettingAllowMultipleSessions, Type: SettingBool, Category: CategorySecurity,
		Default: "true"},

	// System ----------------------------------------------------------------
	{Key: SettingTimezone, Type: SettingString, Category: CategorySystem,
		Default: "Asia/Tashkent", MaxLen: 60},
	{Key: SettingDefaultCountry, Type: SettingString, Category: CategorySystem,
		Default: "Uzbekistan", MaxLen: 60},
	{Key: SettingDefaultCity, Type: SettingString, Category: CategorySystem,
		Default: "Tashkent", MaxLen: 60},
	{Key: SettingPaginationDefaultSize, Type: SettingInt, Category: CategorySystem,
		Default: "20", Options: []string{"10", "20", "50", "100"}},
}

// SettingDefFor finds one declaration by key.
func SettingDefFor(key string) (SettingDef, bool) {
	for _, def := range SettingDefs {
		if def.Key == key {
			return def, true
		}
	}
	return SettingDef{}, false
}
