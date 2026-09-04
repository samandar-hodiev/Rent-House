//go:build integration

// Repository tests: the SQL, against a real PostgreSQL.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/repository/
//
// These are the layer that had no tests at all, which is the layer where a
// wrong WHERE clause is invisible until somebody notices the wrong rows on a
// page. Everything runs inside one transaction that is rolled back, so the
// suite can be pointed at a development database without disturbing it.
package repository_test

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/shopspring/decimal"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
)

var testDSN string

func TestMain(m *testing.M) {
	testDSN = strings.TrimSpace(os.Getenv("TEST_DATABASE_DSN"))
	if testDSN == "" {
		println("repository tests require TEST_DATABASE_DSN")
		os.Exit(1)
	}
	os.Exit(m.Run())
}

// tx opens a transaction that is rolled back when the test ends.
func tx(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(postgres.Open(testDSN), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Silent),
	})
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	transaction := db.Begin()
	if transaction.Error != nil {
		t.Fatalf("begin: %v", transaction.Error)
	}
	t.Cleanup(func() {
		transaction.Rollback()
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return transaction
}

// anyUser and anyApartment borrow a row that already exists, and make one when
// none does.
//
// Borrowing means these tests read real data on a development database rather
// than a fixture that agrees with them by construction; making one means they
// still run on an empty database, which is what continuous integration hands
// them. Everything created here is rolled back with the transaction.
func anyUser(t *testing.T, db *gorm.DB) models.User {
	t.Helper()

	var user models.User
	if err := db.First(&user).Error; err == nil {
		return user
	}

	created := models.User{
		FirstName: "Test", LastName: "Account",
		Email:        pointerTo("repo-fixture@example.test"),
		PasswordHash: "not-a-real-hash",
	}
	if err := db.Create(&created).Error; err != nil {
		t.Fatalf("create fixture account: %v", err)
	}
	return created
}

func anyApartment(t *testing.T, db *gorm.DB) models.Apartment {
	t.Helper()

	var apartment models.Apartment
	if err := db.Where("status = ?", models.ApartmentStatusActive).
		First(&apartment).Error; err == nil {
		return apartment
	}

	owner := anyUser(t, db)

	var district models.District
	if err := db.First(&district).Error; err != nil {
		district = models.District{Name: "Test district", Slug: "test-district"}
		if err := db.Create(&district).Error; err != nil {
			t.Fatalf("create fixture district: %v", err)
		}
	}

	published := time.Now().UTC()
	created := models.Apartment{
		OwnerID: owner.ID, DistrictID: district.ID,
		Title:       "Fixture listing for the repository tests",
		Description: "Created by a test and rolled back with it.",
		Price:       decimal.NewFromInt(4000000), Currency: "UZS", RentalPeriod: "monthly",
		Rooms: 2, Area: 60, Floor: 3, TotalFloors: 9,
		Address: "Test address 1", Latitude: 41.31, Longitude: 69.24,
		Utilities: models.UtilitiesIncluded, Rules: pq.StringArray{},
		Status: models.ApartmentStatusActive, PublishedAt: &published,
	}
	if err := db.Create(&created).Error; err != nil {
		t.Fatalf("create fixture listing: %v", err)
	}
	return created
}

func pointerTo[T any](value T) *T { return &value }

// anyAdmin borrows an administrator, or makes one. The owner is not created
// here: a partial unique index allows only one, and a test must not depend on
// whether the database it was handed already has it.
func anyAdmin(t *testing.T, db *gorm.DB) models.Admin {
	t.Helper()

	var admin models.Admin
	if err := db.First(&admin).Error; err == nil {
		return admin
	}

	created := models.Admin{
		Name: "Test Admin", Email: "repo-fixture-admin@example.test",
		PasswordHash: "not-a-real-hash",
		Role:         models.AdminRoleSuperAdmin, Status: models.AdminStatusActive,
	}
	if err := db.Create(&created).Error; err != nil {
		t.Fatalf("create fixture administrator: %v", err)
	}
	return created
}

// --- settings ---------------------------------------------------------------

func TestSettingsRepositoryStoresOnlyWhatWasSet(t *testing.T) {
	db := tx(t)
	repo := repository.NewSettingsRepository(db)
	ctx := context.Background()

	if err := repo.Set(ctx, []repository.SettingWrite{
		{Key: "site_name", Value: "Test", ValueType: "string", Category: "general"},
	}, nil); err != nil {
		t.Fatalf("set: %v", err)
	}

	all, err := repo.All(ctx)
	if err != nil {
		t.Fatalf("all: %v", err)
	}
	if all["site_name"] != "Test" {
		t.Fatalf("stored value: got %q, want Test", all["site_name"])
	}
	// A key nobody has written is absent rather than empty, which is what lets
	// the service fill in the declared default.
	if _, present := all["a_key_nobody_set"]; present {
		t.Error("a key that was never written came back")
	}

	// Writing the same key twice updates rather than duplicating: the primary
	// key is the key itself.
	if err := repo.Set(ctx, []repository.SettingWrite{
		{Key: "site_name", Value: "Second", ValueType: "string", Category: "general"},
	}, nil); err != nil {
		t.Fatalf("second set: %v", err)
	}
	again, _ := repo.All(ctx)
	if again["site_name"] != "Second" {
		t.Fatalf("after update: got %q, want Second", again["site_name"])
	}

	if _, err := repo.Clear(ctx); err != nil {
		t.Fatalf("clear: %v", err)
	}
	empty, _ := repo.All(ctx)
	if len(empty) != 0 {
		t.Fatalf("after clear: %d rows remain", len(empty))
	}
}

// --- login attempts ---------------------------------------------------------

func TestLoginAttemptsLockAndClear(t *testing.T) {
	db := tx(t)
	repo := repository.NewLoginAttemptRepository(db)
	ctx := context.Background()
	now := time.Now().UTC()

	const identifier = "repo-test@example.test"

	// Below the allowance: counted, not locked.
	for i := 1; i < 3; i++ {
		until, err := repo.Fail(ctx, identifier, 3, 15*time.Minute, now)
		if err != nil {
			t.Fatalf("failure %d: %v", i, err)
		}
		if !until.IsZero() {
			t.Fatalf("locked after %d of 3", i)
		}
	}

	until, err := repo.Fail(ctx, identifier, 3, 15*time.Minute, now)
	if err != nil {
		t.Fatalf("third failure: %v", err)
	}
	if until.IsZero() {
		t.Fatal("the allowance ran out and nothing locked")
	}

	// The lock lifts on its own, and an expired lock starts the count again
	// rather than making the next mistake instantly fatal.
	later := now.Add(16 * time.Minute)
	if locked, _ := repo.LockedUntil(ctx, identifier, later); !locked.IsZero() {
		t.Fatal("the lock outlived its duration")
	}
	after, err := repo.Fail(ctx, identifier, 3, 15*time.Minute, later)
	if err != nil {
		t.Fatalf("failure after expiry: %v", err)
	}
	if !after.IsZero() {
		t.Fatal("one mistake after an expired lock locked again immediately")
	}

	if err := repo.Succeed(ctx, identifier); err != nil {
		t.Fatalf("succeed: %v", err)
	}
	if locked, _ := repo.LockedUntil(ctx, identifier, later); !locked.IsZero() {
		t.Fatal("a correct password left the record behind")
	}
}

// --- refresh tokens ---------------------------------------------------------

func TestRefreshTokenRotationIsSingleUse(t *testing.T) {
	db := tx(t)
	repo := repository.NewRefreshTokenRepository(db)
	ctx := context.Background()
	user := anyUser(t, db)
	now := time.Now().UTC()

	first := &models.RefreshToken{
		UserID: user.ID, TokenHash: strings.Repeat("a", 64),
		ExpiresAt: now.Add(24 * time.Hour),
	}
	if err := repo.Create(ctx, first); err != nil {
		t.Fatalf("create: %v", err)
	}

	second := &models.RefreshToken{
		UserID: user.ID, TokenHash: strings.Repeat("b", 64),
		ExpiresAt: now.Add(24 * time.Hour),
	}
	if err := repo.Rotate(ctx, first.ID, second, now); err != nil {
		t.Fatalf("rotate: %v", err)
	}

	// The old one is revoked and points at its successor.
	stored, err := repo.FindByHash(ctx, first.TokenHash)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if stored.RevokedAt == nil {
		t.Fatal("the rotated token is still live")
	}
	if stored.ReplacedBy == nil || *stored.ReplacedBy != second.ID {
		t.Fatal("the rotated token does not name its successor")
	}
	if stored.IsUsable(now) {
		t.Fatal("a revoked token reports itself usable")
	}

	// Rotating it a second time is refused: two live successors for one session
	// is exactly what rotation exists to prevent.
	third := &models.RefreshToken{
		UserID: user.ID, TokenHash: strings.Repeat("c", 64),
		ExpiresAt: now.Add(24 * time.Hour),
	}
	if err := repo.Rotate(ctx, first.ID, third, now); err == nil {
		t.Fatal("a token was rotated twice")
	}

	// Revoking everything ends the successor too.
	if _, err := repo.RevokeAllForUser(ctx, user.ID, now); err != nil {
		t.Fatalf("revoke all: %v", err)
	}
	live, err := repo.FindByHash(ctx, second.TokenHash)
	if err != nil {
		t.Fatalf("find successor: %v", err)
	}
	if live.RevokedAt == nil {
		t.Fatal("revoking every session left one live")
	}
}

// --- reports ----------------------------------------------------------------

// The duplicate guard is its own test: a rejected insert leaves PostgreSQL's
// transaction aborted, and every statement after it in the same transaction
// fails too. That is a property of testing inside one, not of the repository.
func TestReportRepositoryRefusesASecondOpenComplaint(t *testing.T) {
	db := tx(t)
	repo := repository.NewReportRepository(db)
	ctx := context.Background()

	apartment := anyApartment(t, db)
	reporter := anyUser(t, db)

	first := &models.ListingReport{
		ApartmentID: apartment.ID, ReporterID: &reporter.ID,
		Reason: models.ReportReasonFraud, Status: models.ReportStatusOpen,
	}
	if err := repo.Create(ctx, first); err != nil {
		t.Fatalf("create: %v", err)
	}

	duplicate := &models.ListingReport{
		ApartmentID: apartment.ID, ReporterID: &reporter.ID,
		Reason: models.ReportReasonOther, Status: models.ReportStatusOpen,
	}
	if err := repo.Create(ctx, duplicate); err != repository.ErrReportDuplicate {
		t.Fatalf("duplicate: got %v, want ErrReportDuplicate", err)
	}
}

func TestReportRepositoryCountsOpenComplaints(t *testing.T) {
	db := tx(t)
	repo := repository.NewReportRepository(db)
	ctx := context.Background()

	apartment := anyApartment(t, db)
	reporter := anyUser(t, db)

	admin := anyAdmin(t, db)

	report := &models.ListingReport{
		ApartmentID: apartment.ID, ReporterID: &reporter.ID,
		Reason: models.ReportReasonFraud, Status: models.ReportStatusOpen,
	}
	if err := repo.Create(ctx, report); err != nil {
		t.Fatalf("create: %v", err)
	}

	open, err := repo.CountOpenForApartment(ctx, apartment.ID)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if open < 1 {
		t.Fatal("the new complaint was not counted as open")
	}

	// A resolved complaint leaves the count — which is what the moderation
	// threshold counts, and why the unique index is partial.
	if err := repo.SetStatus(
		ctx, report.ID, models.ReportStatusResolved, "done", admin.ID, time.Now().UTC(),
	); err != nil {
		t.Fatalf("resolve: %v", err)
	}
	after, _ := repo.CountOpenForApartment(ctx, apartment.ID)
	if after != open-1 {
		t.Fatalf("open count after resolving: got %d, want %d", after, open-1)
	}

	// And the same person may report it again.
	again := &models.ListingReport{
		ApartmentID: apartment.ID, ReporterID: &reporter.ID,
		Reason: models.ReportReasonWrongInfo, Status: models.ReportStatusOpen,
	}
	if err := repo.Create(ctx, again); err != nil {
		t.Fatalf("report again after resolution: %v", err)
	}

	// The dashboard's list carries the listing's title, which is what a
	// reviewer reads before anything else.
	rows, total, err := repo.List(ctx, repository.ReportQuery{
		Status: models.ReportStatusOpen, Page: 1, Limit: 20,
	})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total == 0 || len(rows) == 0 {
		t.Fatal("the open list is empty")
	}
	if rows[0].ApartmentTitle == "" {
		t.Error("a row carries no listing title")
	}

	counts, err := repo.CountByStatus(ctx)
	if err != nil {
		t.Fatalf("counts: %v", err)
	}
	if counts[models.ReportStatusResolved] < 1 {
		t.Error("the resolved complaint is not in the tally")
	}
}

// --- notifications ----------------------------------------------------------

func TestNotificationRepositoryKeepsFeedsApart(t *testing.T) {
	db := tx(t)
	repo := repository.NewNotificationRepository(db)
	ctx := context.Background()

	mine := uuid.New()
	theirs := uuid.New()
	now := time.Now().UTC()

	err := repo.CreateMany(ctx, []models.Notification{
		{Audience: models.AudienceUser, RecipientID: mine, Type: "a", Payload: models.JSONMap{"x": 1}},
		{Audience: models.AudienceUser, RecipientID: mine, Type: "b"},
		{Audience: models.AudienceUser, RecipientID: theirs, Type: "c"},
		// Same id, different audience: an administrator and a user are
		// different people even when the uuid happens to match.
		{Audience: models.AudienceAdmin, RecipientID: mine, Type: "d"},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	unread, err := repo.CountUnread(ctx, models.AudienceUser, mine)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if unread != 2 {
		t.Fatalf("unread: got %d, want 2", unread)
	}

	rows, total, err := repo.List(ctx, models.AudienceUser, mine, false, 1, 10)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 2 || len(rows) != 2 {
		t.Fatalf("feed: %d rows, total %d, want 2 and 2", len(rows), total)
	}
	// The payload survives the round trip through jsonb, which is what the
	// sentence is rendered from.
	var withPayload bool
	for _, row := range rows {
		if row.Payload["x"] != nil {
			withPayload = true
		}
	}
	if !withPayload {
		t.Error("the payload did not come back")
	}

	// Marking somebody else's notification does nothing: the recipient is part
	// of the write rather than checked beforehand.
	if err := repo.MarkRead(ctx, rows[0].ID, models.AudienceUser, theirs, now); err != nil {
		t.Fatalf("mark read: %v", err)
	}
	still, _ := repo.CountUnread(ctx, models.AudienceUser, mine)
	if still != 2 {
		t.Fatal("a stranger marked somebody else's notification read")
	}

	if err := repo.MarkRead(ctx, rows[0].ID, models.AudienceUser, mine, now); err != nil {
		t.Fatalf("mark read: %v", err)
	}
	if left, _ := repo.CountUnread(ctx, models.AudienceUser, mine); left != 1 {
		t.Fatalf("after reading one: got %d, want 1", left)
	}

	if _, err := repo.MarkAllRead(ctx, models.AudienceUser, mine, now); err != nil {
		t.Fatalf("mark all: %v", err)
	}
	if left, _ := repo.CountUnread(ctx, models.AudienceUser, mine); left != 0 {
		t.Fatalf("after reading all: got %d, want 0", left)
	}
	// The other two feeds are untouched.
	if left, _ := repo.CountUnread(ctx, models.AudienceUser, theirs); left != 1 {
		t.Fatal("reading one feed emptied another")
	}
	if left, _ := repo.CountUnread(ctx, models.AudienceAdmin, mine); left != 1 {
		t.Fatal("the admin feed was cleared by a user's read")
	}
}
