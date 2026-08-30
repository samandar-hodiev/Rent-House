//go:build integration

// Real PostgreSQL, real repositories, no HTTP. What is under test is the part
// the dashboard cannot check for itself: that a setting saved in the admin area
// actually changes what happens when a listing is written.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/service/ -run Settings
//
// Everything runs inside one transaction that is rolled back, so the test can
// be pointed at a development database without disturbing the data in it.
package service_test

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
)

func settingsTx(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_DSN")
	if dsn == "" {
		t.Skip("TEST_DATABASE_DSN is not set")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Silent),
	})
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatalf("begin: %v", tx.Error)
	}
	t.Cleanup(func() { tx.Rollback() })
	return tx
}

// writeRequest is a listing that satisfies every validation rule, so a test can
// change the one field it cares about.
func writeRequest(districtSlug string, publish bool, images int) dto.ApartmentWriteRequest {
	req := dto.ApartmentWriteRequest{
		Title:        "Settings test listing",
		Description:  "A listing created by the settings integration test.",
		Price:        "4500000",
		Currency:     "UZS",
		RentalPeriod: "monthly",
		Rooms:        2,
		Area:         55,
		Floor:        3,
		TotalFloors:  9,
		DistrictSlug: districtSlug,
		Address:      "Test address 1",
		Latitude:     41.311081,
		Longitude:    69.240562,
		Publish:      publish,
	}
	for i := 0; i < images; i++ {
		req.Images = append(req.Images, dto.ApartmentImageInput{
			URL:       "https://example.test/settings-test.jpg",
			IsPrimary: i == 0,
		})
	}
	return req
}

func TestSettingsGovernListingWrites(t *testing.T) {
	tx := settingsTx(t)
	ctx := context.Background()

	settings := service.NewSettingsService(repository.NewSettingsRepository(tx))
	apartments := service.NewApartmentService(repository.NewApartmentRepository(tx), settings)

	// Any real account: owning a listing is not a role on this marketplace,
	// it is simply having published one.
	// Read as text and parsed: the driver hands a uuid back as a string, and
	// scanning it straight into uuid.UUID reads it as a byte array.
	var ownerRaw string
	if err := tx.Raw(`SELECT id::text FROM users LIMIT 1`).Scan(&ownerRaw).Error; err != nil {
		t.Fatalf("owner account: %v", err)
	}
	if ownerRaw == "" {
		t.Skip("no account to write listings as")
	}
	ownerID, err := uuid.Parse(ownerRaw)
	if err != nil {
		t.Fatalf("owner id: %v", err)
	}
	var districtSlug string
	if err := tx.Raw(`SELECT slug FROM districts LIMIT 1`).Scan(&districtSlug).Error; err != nil {
		t.Fatalf("district: %v", err)
	}

	// Moderation off — the marketplace's default, and how it behaved before it
	// was configurable. Publishing goes live.
	configure(t, settings, map[string]any{
		models.SettingListingModerationRequired: false,
		models.SettingListingMaxImages:          20,
	})
	live, err := apartments.Create(ctx, ownerID, writeRequest(districtSlug, true, 1))
	if err != nil {
		t.Fatalf("create with moderation off: %v", err)
	}
	if live.Status != models.ApartmentStatusActive {
		t.Fatalf("moderation off: got status %q, want %q", live.Status, models.ApartmentStatusActive)
	}

	// Moderation on. The same request must now wait for an administrator.
	configure(t, settings, map[string]any{models.SettingListingModerationRequired: true})
	held, err := apartments.Create(ctx, ownerID, writeRequest(districtSlug, true, 1))
	if err != nil {
		t.Fatalf("create with moderation on: %v", err)
	}
	if held.Status != models.ApartmentStatusPending {
		t.Fatalf("moderation on: got status %q, want %q", held.Status, models.ApartmentStatusPending)
	}

	// A draft is not a publication, so moderation has nothing to hold back.
	draft, err := apartments.Create(ctx, ownerID, writeRequest(districtSlug, false, 1))
	if err != nil {
		t.Fatalf("create draft: %v", err)
	}
	if draft.Status != models.ApartmentStatusDraft {
		t.Fatalf("draft: got status %q, want %q", draft.Status, models.ApartmentStatusDraft)
	}

	// Editing a live listing while moderation is on sends it back for review —
	// otherwise an approved listing could be rewritten into anything at all.
	edited, err := apartments.Update(
		ctx, live.ID, ownerID, writeRequest(districtSlug, true, 1),
	)
	if err != nil {
		t.Fatalf("update with moderation on: %v", err)
	}
	if edited.Status != models.ApartmentStatusPending {
		t.Fatalf("edit under moderation: got status %q, want %q",
			edited.Status, models.ApartmentStatusPending)
	}

	// The image limit is the owner's number, not the binding tag's.
	configure(t, settings, map[string]any{
		models.SettingListingModerationRequired: false,
		models.SettingListingMaxImages:          3,
	})
	if _, err := apartments.Create(ctx, ownerID, writeRequest(districtSlug, true, 4)); !errors.Is(err, service.ErrTooManyImages) {
		t.Fatalf("four images against a limit of three: got %v, want ErrTooManyImages", err)
	}
	if _, err := apartments.Create(ctx, ownerID, writeRequest(districtSlug, true, 3)); err != nil {
		t.Fatalf("three images against a limit of three: %v", err)
	}
}

func TestSettingsClampAndDefault(t *testing.T) {
	tx := settingsTx(t)
	ctx := context.Background()
	settings := service.NewSettingsService(repository.NewSettingsRepository(tx))

	// Out of range is refused rather than quietly clamped: an owner who typed
	// 500 meant something, and storing 50 without saying so would leave the
	// page showing a number nobody chose.
	if _, err := settings.Update(ctx, map[string]any{
		models.SettingListingMaxImages: 500,
	}, nil); !errors.Is(err, service.ErrInvalidSetting) {
		t.Fatalf("500 images: got %v, want ErrInvalidSetting", err)
	}
	if _, err := settings.Update(ctx, map[string]any{
		models.SettingListingMaxImages: 0,
	}, nil); !errors.Is(err, service.ErrInvalidSetting) {
		t.Fatalf("no images: got %v, want ErrInvalidSetting", err)
	}
	// A key the registry does not know is refused too, so a typo cannot write
	// a setting nothing will ever read.
	if _, err := settings.Update(ctx, map[string]any{
		"not_a_setting": true,
	}, nil); !errors.Is(err, service.ErrInvalidSetting) {
		t.Fatalf("unknown key: got %v, want ErrInvalidSetting", err)
	}

	// A key that has never been written reads as its default rather than as an
	// error, so a fresh database behaves like the marketplace always has.
	if err := tx.Exec(`DELETE FROM site_settings`).Error; err != nil {
		t.Fatalf("clear: %v", err)
	}
	fresh, err := settings.Get(ctx)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if fresh.ListingModerationRequired || fresh.ListingMaxImages != 20 {
		t.Fatalf("defaults: moderation %v, images %d; want false and 20",
			fresh.ListingModerationRequired, fresh.ListingMaxImages)
	}
	if !fresh.ChatEnabled || !fresh.UserRegistrationEnabled || fresh.MaintenanceMode {
		t.Fatal("a marketplace with no configuration must be open")
	}
}

// configure writes settings and fails the test if they are refused, so a test
// reads as the rule it is checking rather than as error handling.
func configure(t *testing.T, settings *service.SettingsService, patch map[string]any) {
	t.Helper()
	if _, err := settings.Update(context.Background(), patch, nil); err != nil {
		t.Fatalf("configure %v: %v", patch, err)
	}
}
