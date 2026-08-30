package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
)

// ErrInvalidSetting is a value the registry refuses. The message names the key
// and says what was wrong with it, because an owner correcting a form needs to
// know which field to correct.
var ErrInvalidSetting = errors.New("invalid setting")

// Settings is the marketplace's configuration, parsed.
//
// The `setting` tag ties each field to its key in the registry, and the JSON
// name is that same key, so what the dashboard sends and what the database
// stores never need translating between. A unit test asserts the struct and the
// registry describe exactly the same set — a field without a declaration, or a
// declaration without a field, fails the build's tests rather than going
// quietly missing at runtime.
type Settings struct {
	SiteName        string `setting:"site_name"        json:"site_name"`
	SiteDescription string `setting:"site_description" json:"site_description"`
	SiteLogoURL     string `setting:"site_logo_url"    json:"site_logo_url"`
	SiteFaviconURL  string `setting:"site_favicon_url" json:"site_favicon_url"`

	DefaultLanguage string `setting:"default_language" json:"default_language"`
	DefaultCurrency string `setting:"default_currency" json:"default_currency"`
	DateFormat      string `setting:"date_format"      json:"date_format"`
	TimeFormat      string `setting:"time_format"      json:"time_format"`

	MaintenanceMode    bool   `setting:"maintenance_mode"    json:"maintenance_mode"`
	MaintenanceMessage string `setting:"maintenance_message" json:"maintenance_message"`

	ListingModerationRequired     bool `setting:"listing_moderation_required"      json:"listing_moderation_required"`
	ListingMaxImages              int  `setting:"listing_max_images"               json:"listing_max_images"`
	ListingMaxTitleLength         int  `setting:"listing_max_title_length"         json:"listing_max_title_length"`
	ListingMaxDescriptionLength   int  `setting:"listing_max_description_length"   json:"listing_max_description_length"`
	ListingExpirationDays         int  `setting:"listing_expiration_days"          json:"listing_expiration_days"`
	ListingAutoExpire             bool `setting:"listing_auto_expire"              json:"listing_auto_expire"`
	ListingOwnerCanEdit           bool `setting:"listing_owner_can_edit"           json:"listing_owner_can_edit"`
	ListingOwnerCanDelete         bool `setting:"listing_owner_can_delete"         json:"listing_owner_can_delete"`
	ListingRepublishAllowed       bool `setting:"listing_republish_allowed"        json:"listing_republish_allowed"`
	ListingEditModerationRequired bool `setting:"listing_edit_moderation_required" json:"listing_edit_moderation_required"`

	BlockReasonRequired bool   `setting:"block_reason_required" json:"block_reason_required"`
	BlockListingsAction string `setting:"block_listings_action" json:"block_listings_action"`

	UserRegistrationEnabled    bool `setting:"user_registration_enabled"     json:"user_registration_enabled"`
	RegistrationEmailEnabled   bool `setting:"registration_email_enabled"    json:"registration_email_enabled"`
	RegistrationPhoneEnabled   bool `setting:"registration_phone_enabled"    json:"registration_phone_enabled"`
	UserAvatarRequired         bool `setting:"user_avatar_required"          json:"user_avatar_required"`
	UserProfileEditEnabled     bool `setting:"user_profile_edit_enabled"     json:"user_profile_edit_enabled"`
	BlockedContactReuseAllowed bool `setting:"blocked_contact_reuse_allowed" json:"blocked_contact_reuse_allowed"`

	ChatEnabled          bool `setting:"chat_enabled"           json:"chat_enabled"`
	UserMessagingEnabled bool `setting:"user_messaging_enabled" json:"user_messaging_enabled"`
	ContactOwnerEnabled  bool `setting:"contact_owner_enabled"  json:"contact_owner_enabled"`
	MessageMaxLength     int  `setting:"message_max_length"     json:"message_max_length"`
	MessageEditAllowed   bool `setting:"message_edit_allowed"   json:"message_edit_allowed"`
	MessageDeleteAllowed bool `setting:"message_delete_allowed" json:"message_delete_allowed"`

	MediaMaxImageMB          int      `setting:"media_max_image_mb"          json:"media_max_image_mb"`
	MediaAllowedImageFormats []string `setting:"media_allowed_image_formats" json:"media_allowed_image_formats"`
	MediaMaxAvatarMB         int      `setting:"media_max_avatar_mb"         json:"media_max_avatar_mb"`
	MediaMaxListingImageMB   int      `setting:"media_max_listing_image_mb"  json:"media_max_listing_image_mb"`
	MediaImageCompression    bool     `setting:"media_image_compression"     json:"media_image_compression"`
	MediaUploadQuality       int      `setting:"media_upload_quality"        json:"media_upload_quality"`

	JWTExpirationHours    int  `setting:"jwt_expiration_hours"     json:"jwt_expiration_hours"`
	LoginMaxAttempts      int  `setting:"login_max_attempts"       json:"login_max_attempts"`
	LoginLockMinutes      int  `setting:"login_lock_minutes"       json:"login_lock_minutes"`
	PasswordMinLength     int  `setting:"password_min_length"      json:"password_min_length"`
	PasswordRequireStrong bool `setting:"password_require_strong"  json:"password_require_strong"`
	AllowMultipleSessions bool `setting:"allow_multiple_sessions"  json:"allow_multiple_sessions"`

	Timezone              string `setting:"timezone"               json:"timezone"`
	DefaultCountry        string `setting:"default_country"        json:"default_country"`
	DefaultCity           string `setting:"default_city"           json:"default_city"`
	PaginationDefaultSize int    `setting:"pagination_default_size" json:"pagination_default_size"`
}

// settingsCacheTTL bounds how stale a read can be.
//
// The configuration is consulted on nearly every request — the maintenance
// check alone runs on all of them — and reading a table each time to learn that
// nothing changed is a query per request for no information. A write clears the
// cache immediately, so within one process a change is instant; the TTL is what
// bounds staleness for a second process that did not do the writing.
const settingsCacheTTL = 5 * time.Second

// SettingsService reads and writes the marketplace's configuration.
//
// It is the only place that turns stored text into typed values, so every
// consumer sees the same value parsed the same way.
type SettingsService struct {
	settings *repository.SettingsRepository

	mu     sync.RWMutex
	cached *Settings
	readAt time.Time
}

func NewSettingsService(settings *repository.SettingsRepository) *SettingsService {
	return &SettingsService{settings: settings}
}

// Defaults is the configuration as declared, with nothing stored.
func Defaults() *Settings {
	out := &Settings{}
	raw := map[string]string{}
	// decode fills every field from the registry's defaults when the map is
	// empty, which is exactly what a fresh database looks like.
	_ = decodeSettings(out, raw)
	return out
}

// Get returns the current configuration.
//
// A stored value that cannot be parsed falls back to its default rather than
// failing the request: the marketplace must keep serving even if one row is
// somehow malformed, and a setting nobody can read is a setting nobody set.
func (s *SettingsService) Get(ctx context.Context) (*Settings, error) {
	s.mu.RLock()
	if s.cached != nil && time.Since(s.readAt) < settingsCacheTTL {
		cached := *s.cached
		s.mu.RUnlock()
		return &cached, nil
	}
	s.mu.RUnlock()

	raw, err := s.settings.All(ctx)
	if err != nil {
		return nil, err
	}
	out := &Settings{}
	_ = decodeSettings(out, raw)

	s.mu.Lock()
	s.cached = out
	s.readAt = time.Now()
	s.mu.Unlock()

	copied := *out
	return &copied, nil
}

// MustGet is Get for callers that cannot report an error — a middleware
// deciding whether the site is in maintenance, say. A failed read yields the
// declared defaults, which keeps the marketplace open rather than closing it
// because of a database hiccup.
func (s *SettingsService) MustGet(ctx context.Context) *Settings {
	current, err := s.Get(ctx)
	if err != nil || current == nil {
		return Defaults()
	}
	return current
}

// SettingChange is one value that moved, for the audit log.
type SettingChange struct {
	Key string
	Old string
	New string
}

// Update writes the values in `patch` — a key to raw-value map holding only
// what the owner actually changed — and reports which ones moved.
//
// Partial by design: the dashboard saves one section at a time, and a whole-form
// write would let two administrators saving different cards overwrite each
// other with values neither of them chose.
func (s *SettingsService) Update(
	ctx context.Context, patch map[string]any, actorID *uuid.UUID,
) ([]SettingChange, error) {
	if len(patch) == 0 {
		return nil, nil
	}

	stored, err := s.settings.All(ctx)
	if err != nil {
		return nil, err
	}
	current := &Settings{}
	_ = decodeSettings(current, stored)

	writes := make([]repository.SettingWrite, 0, len(patch))
	changes := make([]SettingChange, 0, len(patch))

	for key, value := range patch {
		def, ok := models.SettingDefFor(key)
		if !ok {
			return nil, fmt.Errorf("%w: %s is not a setting", ErrInvalidSetting, key)
		}
		encoded, err := normalizeSetting(def, value)
		if err != nil {
			return nil, err
		}
		before := currentValue(current, def.Key)
		if before == encoded {
			continue
		}
		writes = append(writes, repository.SettingWrite{
			Key: def.Key, Value: encoded,
			ValueType: string(def.Type), Category: def.Category,
		})
		changes = append(changes, SettingChange{Key: def.Key, Old: before, New: encoded})
	}

	if len(writes) == 0 {
		return nil, nil
	}
	if err := s.settings.Set(ctx, writes, actorID); err != nil {
		return nil, err
	}

	// Cleared rather than updated in place: the next read rebuilds from the
	// table, so what callers see is what was actually stored.
	s.mu.Lock()
	s.cached = nil
	s.mu.Unlock()

	return changes, nil
}

// LastUpdated is when the configuration last changed.
func (s *SettingsService) LastUpdated(ctx context.Context) (time.Time, error) {
	return s.settings.LastUpdated(ctx)
}

// Location resolves the configured timezone, falling back to UTC when it names
// no zone this system knows.
func (s *Settings) Location() *time.Location {
	if loc, err := time.LoadLocation(s.Timezone); err == nil {
		return loc
	}
	return time.UTC
}

// normalizeSetting validates one incoming value and returns the text to store.
//
// The dashboard sends JSON, so a boolean arrives as a bool and a number as a
// float64; a string is also accepted for every type, because a form field is
// text and it would be perverse to reject "20" for an integer.
func normalizeSetting(def models.SettingDef, value any) (string, error) {
	switch def.Type {
	case models.SettingBool:
		switch typed := value.(type) {
		case bool:
			return strconv.FormatBool(typed), nil
		case string:
			parsed, err := strconv.ParseBool(strings.TrimSpace(typed))
			if err != nil {
				return "", fmt.Errorf("%w: %s must be true or false", ErrInvalidSetting, def.Key)
			}
			return strconv.FormatBool(parsed), nil
		}
		return "", fmt.Errorf("%w: %s must be true or false", ErrInvalidSetting, def.Key)

	case models.SettingInt:
		number, ok := toInt(value)
		if !ok {
			return "", fmt.Errorf("%w: %s must be a whole number", ErrInvalidSetting, def.Key)
		}
		text := strconv.FormatInt(number, 10)
		if len(def.Options) > 0 {
			if !contains(def.Options, text) {
				return "", fmt.Errorf("%w: %s must be one of %s",
					ErrInvalidSetting, def.Key, strings.Join(def.Options, ", "))
			}
			return text, nil
		}
		if number < def.Min || number > def.Max {
			return "", fmt.Errorf("%w: %s must be between %d and %d",
				ErrInvalidSetting, def.Key, def.Min, def.Max)
		}
		return text, nil

	case models.SettingString:
		text, ok := value.(string)
		if !ok {
			return "", fmt.Errorf("%w: %s must be text", ErrInvalidSetting, def.Key)
		}
		text = strings.TrimSpace(text)
		if len(def.Options) > 0 {
			if !contains(def.Options, text) {
				return "", fmt.Errorf("%w: %s must be one of %s",
					ErrInvalidSetting, def.Key, strings.Join(def.Options, ", "))
			}
			return text, nil
		}
		if def.MaxLen > 0 && len([]rune(text)) > def.MaxLen {
			return "", fmt.Errorf("%w: %s must be at most %d characters",
				ErrInvalidSetting, def.Key, def.MaxLen)
		}
		if def.Key == models.SettingTimezone {
			if _, err := time.LoadLocation(text); err != nil {
				return "", fmt.Errorf("%w: %s is not a known timezone", ErrInvalidSetting, def.Key)
			}
		}
		return text, nil

	case models.SettingJSON:
		items, err := toStringSlice(value)
		if err != nil {
			return "", fmt.Errorf("%w: %s must be a list", ErrInvalidSetting, def.Key)
		}
		if len(items) == 0 {
			return "", fmt.Errorf("%w: %s cannot be empty", ErrInvalidSetting, def.Key)
		}
		// Kept in the registry's order rather than the client's, so the stored
		// value is stable and two saves of the same choice are one value.
		ordered := make([]string, 0, len(items))
		for _, option := range def.Options {
			if contains(items, option) {
				ordered = append(ordered, option)
			}
		}
		if len(ordered) != len(items) {
			return "", fmt.Errorf("%w: %s accepts only %s",
				ErrInvalidSetting, def.Key, strings.Join(def.Options, ", "))
		}
		encoded, err := json.Marshal(ordered)
		if err != nil {
			return "", fmt.Errorf("%w: %s", ErrInvalidSetting, def.Key)
		}
		return string(encoded), nil
	}
	return "", fmt.Errorf("%w: %s has no type", ErrInvalidSetting, def.Key)
}

// decodeSettings fills a Settings from stored values, using each declared
// default where a key is absent or unreadable.
//
// Reflection, deliberately: fifty-odd fields parsed by hand would be fifty
// chances to read one into the wrong field, and the `setting` tag makes the
// mapping visible at the field itself. It runs once per cache miss, not per
// read.
func decodeSettings(out *Settings, stored map[string]string) error {
	value := reflect.ValueOf(out).Elem()
	structType := value.Type()

	for i := 0; i < structType.NumField(); i++ {
		field := structType.Field(i)
		key := field.Tag.Get("setting")
		if key == "" {
			continue
		}
		def, ok := models.SettingDefFor(key)
		if !ok {
			return fmt.Errorf("settings: field %s has no declaration", field.Name)
		}

		raw, present := stored[key]
		if !present {
			raw = def.Default
		}
		if err := assignSetting(value.Field(i), def, raw); err != nil {
			// Unreadable: fall back to the default rather than refusing to
			// serve. A malformed row is a bug to fix, not a reason to close.
			_ = assignSetting(value.Field(i), def, def.Default)
		}
	}
	return nil
}

func assignSetting(field reflect.Value, def models.SettingDef, raw string) error {
	switch def.Type {
	case models.SettingBool:
		parsed, err := strconv.ParseBool(raw)
		if err != nil {
			return err
		}
		field.SetBool(parsed)
	case models.SettingInt:
		parsed, err := strconv.Atoi(raw)
		if err != nil {
			return err
		}
		if len(def.Options) == 0 && (int64(parsed) < def.Min || int64(parsed) > def.Max) {
			return fmt.Errorf("out of range")
		}
		field.SetInt(int64(parsed))
	case models.SettingString:
		field.SetString(raw)
	case models.SettingJSON:
		var items []string
		if err := json.Unmarshal([]byte(raw), &items); err != nil {
			return err
		}
		field.Set(reflect.ValueOf(items))
	}
	return nil
}

// currentValue renders one field as it would be stored, so a patch can be
// compared against what is already in force and unchanged keys skipped.
func currentValue(settings *Settings, key string) string {
	value := reflect.ValueOf(settings).Elem()
	structType := value.Type()
	for i := 0; i < structType.NumField(); i++ {
		if structType.Field(i).Tag.Get("setting") != key {
			continue
		}
		field := value.Field(i)
		switch field.Kind() {
		case reflect.Bool:
			return strconv.FormatBool(field.Bool())
		case reflect.Int:
			return strconv.FormatInt(field.Int(), 10)
		case reflect.String:
			return field.String()
		case reflect.Slice:
			encoded, _ := json.Marshal(field.Interface())
			return string(encoded)
		}
	}
	return ""
}

func toInt(value any) (int64, bool) {
	switch typed := value.(type) {
	case float64:
		if typed != float64(int64(typed)) {
			return 0, false
		}
		return int64(typed), true
	case int:
		return int64(typed), true
	case int64:
		return typed, true
	case string:
		parsed, err := strconv.ParseInt(strings.TrimSpace(typed), 10, 64)
		if err != nil {
			return 0, false
		}
		return parsed, true
	}
	return 0, false
}

func toStringSlice(value any) ([]string, error) {
	switch typed := value.(type) {
	case []string:
		return typed, nil
	case string:
		// Also accepted as text, so a stored value can be re-validated and a
		// client that sends `["jpg","png"]` as a string is not refused for it.
		var items []string
		if err := json.Unmarshal([]byte(typed), &items); err != nil {
			return nil, fmt.Errorf("not a list")
		}
		for i, item := range items {
			items[i] = strings.ToLower(strings.TrimSpace(item))
		}
		return items, nil
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			text, ok := item.(string)
			if !ok {
				return nil, fmt.Errorf("not a string")
			}
			out = append(out, strings.ToLower(strings.TrimSpace(text)))
		}
		return out, nil
	}
	return nil, fmt.Errorf("not a list")
}

func contains(list []string, want string) bool {
	for _, item := range list {
		if item == want {
			return true
		}
	}
	return false
}

// PublicSettings is the part of the configuration the marketplace itself needs.
//
// A separate shape, not the whole record: the public site has no business
// knowing how many login attempts are allowed before an account locks, or how
// long a token lives. What is here is what a browser must know to render the
// site the way the owner configured it — and each field is also enforced by the
// server, so nothing here is load-bearing for security.
type PublicSettings struct {
	SiteName        string `json:"site_name"`
	SiteDescription string `json:"site_description"`
	SiteLogoURL     string `json:"site_logo_url"`
	SiteFaviconURL  string `json:"site_favicon_url"`

	DefaultLanguage string `json:"default_language"`
	DefaultCurrency string `json:"default_currency"`
	DateFormat      string `json:"date_format"`
	TimeFormat      string `json:"time_format"`
	Timezone        string `json:"timezone"`
	DefaultCountry  string `json:"default_country"`
	DefaultCity     string `json:"default_city"`

	MaintenanceMode    bool   `json:"maintenance_mode"`
	MaintenanceMessage string `json:"maintenance_message"`

	RegistrationEnabled      bool `json:"user_registration_enabled"`
	RegistrationEmailEnabled bool `json:"registration_email_enabled"`
	RegistrationPhoneEnabled bool `json:"registration_phone_enabled"`
	ProfileEditEnabled       bool `json:"user_profile_edit_enabled"`
	AvatarRequired           bool `json:"user_avatar_required"`

	ChatEnabled          bool `json:"chat_enabled"`
	MessagingEnabled     bool `json:"user_messaging_enabled"`
	ContactOwnerEnabled  bool `json:"contact_owner_enabled"`
	MessageMaxLength     int  `json:"message_max_length"`
	MessageEditAllowed   bool `json:"message_edit_allowed"`
	MessageDeleteAllowed bool `json:"message_delete_allowed"`

	ListingModerationRequired   bool `json:"listing_moderation_required"`
	ListingMaxImages            int  `json:"listing_max_images"`
	ListingMaxTitleLength       int  `json:"listing_max_title_length"`
	ListingMaxDescriptionLength int  `json:"listing_max_description_length"`
	ListingExpirationDays       int  `json:"listing_expiration_days"`
	ListingAutoExpire           bool `json:"listing_auto_expire"`
	ListingOwnerCanEdit         bool `json:"listing_owner_can_edit"`
	ListingOwnerCanDelete       bool `json:"listing_owner_can_delete"`
	ListingRepublishAllowed     bool `json:"listing_republish_allowed"`

	MediaMaxImageMB          int      `json:"media_max_image_mb"`
	MediaAllowedImageFormats []string `json:"media_allowed_image_formats"`
	MediaMaxAvatarMB         int      `json:"media_max_avatar_mb"`
	MediaMaxListingImageMB   int      `json:"media_max_listing_image_mb"`

	PasswordMinLength     int  `json:"password_min_length"`
	PasswordRequireStrong bool `json:"password_require_strong"`
	PaginationDefaultSize int  `json:"pagination_default_size"`
}

// Public shapes the configuration for the marketplace's own frontend.
func (s *Settings) Public() *PublicSettings {
	return &PublicSettings{
		SiteName:        s.SiteName,
		SiteDescription: s.SiteDescription,
		SiteLogoURL:     s.SiteLogoURL,
		SiteFaviconURL:  s.SiteFaviconURL,

		DefaultLanguage: s.DefaultLanguage,
		DefaultCurrency: s.DefaultCurrency,
		DateFormat:      s.DateFormat,
		TimeFormat:      s.TimeFormat,
		Timezone:        s.Timezone,
		DefaultCountry:  s.DefaultCountry,
		DefaultCity:     s.DefaultCity,

		MaintenanceMode:    s.MaintenanceMode,
		MaintenanceMessage: s.MaintenanceMessage,

		RegistrationEnabled:      s.UserRegistrationEnabled,
		RegistrationEmailEnabled: s.RegistrationEmailEnabled,
		RegistrationPhoneEnabled: s.RegistrationPhoneEnabled,
		ProfileEditEnabled:       s.UserProfileEditEnabled,
		AvatarRequired:           s.UserAvatarRequired,

		ChatEnabled:          s.ChatEnabled,
		MessagingEnabled:     s.UserMessagingEnabled,
		ContactOwnerEnabled:  s.ContactOwnerEnabled,
		MessageMaxLength:     s.MessageMaxLength,
		MessageEditAllowed:   s.MessageEditAllowed,
		MessageDeleteAllowed: s.MessageDeleteAllowed,

		ListingModerationRequired:   s.ListingModerationRequired,
		ListingMaxImages:            s.ListingMaxImages,
		ListingMaxTitleLength:       s.ListingMaxTitleLength,
		ListingMaxDescriptionLength: s.ListingMaxDescriptionLength,
		ListingExpirationDays:       s.ListingExpirationDays,
		ListingAutoExpire:           s.ListingAutoExpire,
		ListingOwnerCanEdit:         s.ListingOwnerCanEdit,
		ListingOwnerCanDelete:       s.ListingOwnerCanDelete,
		ListingRepublishAllowed:     s.ListingRepublishAllowed,

		MediaMaxImageMB:          s.MediaMaxImageMB,
		MediaAllowedImageFormats: s.MediaAllowedImageFormats,
		MediaMaxAvatarMB:         s.MediaMaxAvatarMB,
		MediaMaxListingImageMB:   s.MediaMaxListingImageMB,

		PasswordMinLength:     s.PasswordMinLength,
		PasswordRequireStrong: s.PasswordRequireStrong,
		PaginationDefaultSize: s.PaginationDefaultSize,
	}
}
