//go:build integration

// AdminService.UpdateProfile's avatar handling — an audit found the handler's
// old isOwnUpload check accepted any URL whose path merely contained
// "/uploads/" somewhere, regardless of host, so an administrator could point
// their avatar at an attacker's server and every other administrator viewing
// the dashboard (user tables, audit log, the header) would fetch an image
// from it. The fix reduces a submitted URL to its path — see uploadPath in
// auth_service.go, which this reuses — discarding whatever host the client
// named, the same way the marketplace's own avatar already worked.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run AdminProfileAvatar
package handler

import (
	"errors"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
)

func newTestAdmin(t *testing.T, tx *gorm.DB) *models.Admin {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte("StrongPassword123"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	admin := &models.Admin{
		Name: "Profile Test Admin", Email: uniqueEmail(), PasswordHash: string(hash),
		Role: models.AdminRoleSuperAdmin, Status: models.AdminStatusActive,
	}
	if err := tx.Create(admin).Error; err != nil {
		t.Fatalf("create admin: %v", err)
	}
	return admin
}

func TestAdminProfileAvatarIsReducedToAPathRegardlessOfHost(t *testing.T) {
	db, err := gorm.Open(postgres.Open(testDSN), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Silent),
	})
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatalf("begin: %v", tx.Error)
	}
	t.Cleanup(func() {
		tx.Rollback()
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})

	tokens, err := token.New(integrationSecret, time.Hour)
	if err != nil {
		t.Fatalf("tokens: %v", err)
	}
	settings := service.NewSettingsService(repository.NewSettingsRepository(tx))
	admins := service.NewAdminService(
		repository.NewAdminRepository(tx), tokens, settings, nil, nil, nil,
	)

	// This server's own upload, submitted as the absolute URL the upload
	// endpoint actually hands back — must be accepted and reduced to its path.
	t.Run("own upload as an absolute URL is reduced to its path", func(t *testing.T) {
		admin := newTestAdmin(t, tx)
		own := "http://localhost:8081/uploads/images/2026-09/abc123.jpg"
		updated, err := admins.UpdateProfile(t.Context(), admin, admin.Name, &own)
		if err != nil {
			t.Fatalf("UpdateProfile: %v", err)
		}
		if updated.AvatarURL == nil || *updated.AvatarURL != "/uploads/images/2026-09/abc123.jpg" {
			got := "nil"
			if updated.AvatarURL != nil {
				got = *updated.AvatarURL
			}
			t.Fatalf("stored avatar = %q, want the bare path with the host discarded", got)
		}
	})

	// The exact shape of the bug: a path that merely *contains* "/uploads/"
	// on a host that is not this server's.
	t.Run("another host's URL is rejected even when its path contains /uploads/", func(t *testing.T) {
		admin := newTestAdmin(t, tx)
		attacker := "https://evil.example/tracking/uploads/pixel.jpg"
		_, err := admins.UpdateProfile(t.Context(), admin, admin.Name, &attacker)
		if !errors.Is(err, service.ErrInvalidAvatar) {
			t.Fatalf("got %v, want ErrInvalidAvatar", err)
		}

		// And nothing was written — a rejected update must not partially apply.
		fresh, err := repository.NewAdminRepository(tx).FindByID(t.Context(), admin.ID)
		if err != nil {
			t.Fatalf("re-read admin: %v", err)
		}
		if fresh.AvatarURL != nil {
			t.Fatalf("avatar was stored despite rejection: %q", *fresh.AvatarURL)
		}
	})

	// A bare path, as an older record might already hold, keeps working.
	t.Run("a bare path is accepted as-is", func(t *testing.T) {
		admin := newTestAdmin(t, tx)
		bare := "/uploads/images/2026-09/def456.jpg"
		updated, err := admins.UpdateProfile(t.Context(), admin, admin.Name, &bare)
		if err != nil {
			t.Fatalf("UpdateProfile: %v", err)
		}
		if updated.AvatarURL == nil || *updated.AvatarURL != bare {
			t.Fatalf("stored avatar changed: got %v, want %q", updated.AvatarURL, bare)
		}
	})

	// A path outside the upload tree entirely — not a host trick, just not an
	// upload — is refused the same way.
	t.Run("a path that is not under the upload tree is rejected", func(t *testing.T) {
		admin := newTestAdmin(t, tx)
		notAnUpload := "/etc/passwd"
		_, err := admins.UpdateProfile(t.Context(), admin, admin.Name, &notAnUpload)
		if !errors.Is(err, service.ErrInvalidAvatar) {
			t.Fatalf("got %v, want ErrInvalidAvatar", err)
		}
	})
}
