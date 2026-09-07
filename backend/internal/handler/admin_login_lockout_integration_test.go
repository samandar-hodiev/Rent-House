//go:build integration

// The admin dashboard's own sign-in lockout — added alongside the marketplace's
// (see login_lockout_integration_test.go) once an audit found AdminService.Login
// had no defense against unlimited password-guessing at all: no per-identifier
// lockout and no IP rate limit, on the highest-privilege accounts in the system.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run AdminLoginLockout
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

const adminLockoutPassword = "StrongPassword123"

func TestAdminLoginLocksAfterRepeatedFailuresAndClearsOnSuccess(t *testing.T) {
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

	hash, err := bcrypt.GenerateFromPassword([]byte(adminLockoutPassword), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	email := uniqueEmail()
	admin := &models.Admin{
		Name:         "Lockout Test Admin",
		Email:        email,
		PasswordHash: string(hash),
		Role:         models.AdminRoleSuperAdmin,
		Status:       models.AdminStatusActive,
	}
	if err := tx.Create(admin).Error; err != nil {
		t.Fatalf("create admin: %v", err)
	}

	settings := service.NewSettingsService(repository.NewSettingsRepository(tx))
	admins := service.NewAdminService(
		repository.NewAdminRepository(tx), tokens, settings,
		repository.NewLoginAttemptRepository(tx),
		repository.NewRefreshTokenRepository(tx), repository.NewAdminRefreshTokenRepository(tx),
	)

	site, err := settings.Get(t.Context())
	if err != nil {
		t.Fatalf("read settings: %v", err)
	}

	// One short of the allowance: still judged, still just a wrong password.
	for i := 1; i < site.LoginMaxAttempts; i++ {
		if _, err := admins.Login(t.Context(), email, "wrong-password"); err != service.ErrAdminCredentials {
			t.Fatalf("attempt %d: got %v, want ErrAdminCredentials", i, err)
		}
	}

	// The one that uses up the allowance locks the account — even the
	// correct password is refused without being checked.
	if _, err := admins.Login(t.Context(), email, "wrong-password"); err == nil {
		t.Fatal("expected the final wrong attempt to lock the account")
	}
	if _, err := admins.Login(t.Context(), email, adminLockoutPassword); !errors.Is(err, service.ErrAccountLocked) {
		t.Fatalf("correct password while locked: got %v, want ErrAccountLocked", err)
	}

	// A second admin's own login is unaffected — the lock is per identifier.
	other := &models.Admin{
		Name: "Other Admin", Email: uniqueEmail(), PasswordHash: string(hash),
		Role: models.AdminRoleSuperAdmin, Status: models.AdminStatusActive,
	}
	if err := tx.Create(other).Error; err != nil {
		t.Fatalf("create other admin: %v", err)
	}
	if _, err := admins.Login(t.Context(), other.Email, adminLockoutPassword); err != nil {
		t.Fatalf("an unrelated admin was locked out too: %v", err)
	}
}

// A namespaced admin identifier must not share a lock with a marketplace
// account of the same email — see loginAttemptKey in admin_service.go.
func TestAdminLoginLockoutIsNamespacedApartFromMarketplaceLogins(t *testing.T) {
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

	attempts := repository.NewLoginAttemptRepository(tx)
	now := time.Now().UTC()
	sharedEmail := uniqueEmail()

	// Lock the *marketplace* identifier directly, at the repository the
	// marketplace's own login uses it through unprefixed.
	for i := 0; i < 5; i++ {
		if _, err := attempts.Fail(t.Context(), sharedEmail, 5, 15*time.Minute, now); err != nil {
			t.Fatalf("fail %d: %v", i, err)
		}
	}
	locked, err := attempts.LockedUntil(t.Context(), sharedEmail, now)
	if err != nil || locked.IsZero() {
		t.Fatalf("marketplace identifier did not lock: locked=%v err=%v", locked, err)
	}

	// The admin path for the same email string reads a different key, so it
	// sees no lock at all.
	tokens, err := token.New(integrationSecret, time.Hour)
	if err != nil {
		t.Fatalf("tokens: %v", err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(adminLockoutPassword), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	admin := &models.Admin{
		Name: "Shared Email Admin", Email: sharedEmail, PasswordHash: string(hash),
		Role: models.AdminRoleSuperAdmin, Status: models.AdminStatusActive,
	}
	if err := tx.Create(admin).Error; err != nil {
		t.Fatalf("create admin: %v", err)
	}
	settings := service.NewSettingsService(repository.NewSettingsRepository(tx))
	admins := service.NewAdminService(
		repository.NewAdminRepository(tx), tokens, settings, attempts,
		repository.NewRefreshTokenRepository(tx), repository.NewAdminRefreshTokenRepository(tx),
	)
	if _, err := admins.Login(t.Context(), sharedEmail, adminLockoutPassword); err != nil {
		t.Fatalf("admin login was locked out by the marketplace's own lock: %v", err)
	}
}
