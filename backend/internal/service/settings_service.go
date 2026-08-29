package service

import (
	"context"
	"strconv"

	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
)

// The settings the marketplace actually acts on.
//
// Deliberately two. A settings page is only worth having if switching something
// changes what the product does; a switch that saves and then does nothing is
// the same decoration as one that does not save at all. These two are enforced
// where listings are written — see ApartmentService — and the page offers
// nothing else until there is something else to enforce.
const (
	SettingRequireModeration = "require_moderation"
	SettingMaxImages         = "max_images"
)

// Defaults, used when a key has never been written and when a value cannot be
// read. They are how the marketplace behaved before it was configurable.
const (
	defaultRequireModeration = false
	defaultMaxImages         = 20
	// A ceiling on the ceiling: a listing with two hundred photographs is a
	// denial-of-service dressed as a preference.
	maxImagesCeiling = 50
)

// Settings is the configuration, parsed.
type Settings struct {
	RequireModeration bool `json:"require_moderation"`
	MaxImages         int  `json:"max_images"`
}

// SettingsService reads and writes the marketplace's configuration.
type SettingsService struct {
	settings *repository.SettingsRepository
}

func NewSettingsService(settings *repository.SettingsRepository) *SettingsService {
	return &SettingsService{settings: settings}
}

// Get returns the current configuration.
//
// A missing or unreadable value falls back to its default rather than failing:
// the marketplace must keep working when a row is absent, and a setting nobody
// has touched is exactly that case.
func (s *SettingsService) Get(ctx context.Context) (*Settings, error) {
	raw, err := s.settings.All(ctx)
	if err != nil {
		return nil, err
	}

	out := &Settings{
		RequireModeration: defaultRequireModeration,
		MaxImages:         defaultMaxImages,
	}
	if value, ok := raw[SettingRequireModeration]; ok {
		if parsed, err := strconv.ParseBool(value); err == nil {
			out.RequireModeration = parsed
		}
	}
	if value, ok := raw[SettingMaxImages]; ok {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			out.MaxImages = min(parsed, maxImagesCeiling)
		}
	}
	return out, nil
}

// Set writes the configuration. The caller has already been established as the
// owner by the route.
func (s *SettingsService) Set(ctx context.Context, next Settings) (*Settings, error) {
	images := next.MaxImages
	if images < 1 {
		images = 1
	}
	if images > maxImagesCeiling {
		images = maxImagesCeiling
	}

	err := s.settings.Set(ctx, map[string]string{
		SettingRequireModeration: strconv.FormatBool(next.RequireModeration),
		SettingMaxImages:         strconv.Itoa(images),
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx)
}
