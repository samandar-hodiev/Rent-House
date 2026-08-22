//go:build integration

// These tests verify that the database itself rejects duplicates — not that the
// application remembers to check. They need a migrated PostgreSQL database and
// are therefore excluded from the default `go test ./...` run:
//
//	TEST_DATABASE_DSN="host=localhost port=5432 user=postgres password=postgres dbname=renthouse sslmode=disable" \
//	    go test -tags=integration ./...
//
// The DSN is required rather than inferred: asking for the integration build tag
// and then silently skipping would report success without testing anything.
//
// Every test runs inside a transaction that is rolled back, so the database is
// left exactly as it was found.
package database

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// testDSN is resolved once; an empty value fails the run rather than skipping it.
var testDSN string

func TestMain(m *testing.M) {
	testDSN = strings.TrimSpace(os.Getenv("TEST_DATABASE_DSN"))
	if testDSN == "" {
		println("integration tests require TEST_DATABASE_DSN, e.g.")
		println(`  TEST_DATABASE_DSN="host=localhost port=5432 user=postgres password=postgres dbname=renthouse sslmode=disable"`)
		os.Exit(1)
	}
	os.Exit(m.Run())
}

// withRollback gives the test a transaction and always rolls it back.
func withRollback(t *testing.T, fn func(tx *gorm.DB)) {
	t.Helper()

	db, err := gorm.Open(postgres.Open(testDSN), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Silent),
	})
	if err != nil {
		t.Fatalf("connect to TEST_DATABASE_DSN: %v", err)
	}
	t.Cleanup(func() { _ = Close(db) })

	tx := db.Begin()
	if tx.Error != nil {
		t.Fatalf("begin transaction: %v", tx.Error)
	}
	defer tx.Rollback()

	fn(tx)
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE 23505")
}

// unique returns a value that cannot collide with existing rows.
func unique(prefix string) string { return prefix + uuid.NewString()[:8] }

func newUser() *models.User {
	email := unique("user-") + "@example.test"
	phone := unique("+99890")
	return &models.User{
		FirstName:    "Test",
		LastName:     "User",
		Email:        &email,
		Phone:        &phone,
		PasswordHash: "not-a-real-hash",
		Language:     models.LanguageUz,
		Theme:        models.ThemeLight,
	}
}

// seedApartment creates the user, district and apartment an dependent test needs.
func seedApartment(t *testing.T, tx *gorm.DB) (*models.User, *models.Apartment) {
	t.Helper()

	owner := newUser()
	if err := tx.Create(owner).Error; err != nil {
		t.Fatalf("create owner: %v", err)
	}

	district := &models.District{
		Name: unique("District "), Slug: unique("district-"),
		Latitude: 41.3, Longitude: 69.2,
	}
	if err := tx.Create(district).Error; err != nil {
		t.Fatalf("create district: %v", err)
	}

	// Since 0006 a live listing carries the moment it went live, and a CHECK
	// requires the two to agree — an active row with no published_at is exactly
	// the state analytics could not make sense of.
	publishedAt := time.Now()
	apartment := &models.Apartment{
		OwnerID: owner.ID, DistrictID: district.ID,
		Title: "Test apartment", Price: decimal.NewFromInt(4500000),
		Currency: models.CurrencyUZS, RentalPeriod: models.RentalPeriodMonthly,
		Rooms: 2, Area: 68, Floor: 4, TotalFloors: 9,
		Status: models.ApartmentStatusActive, PublishedAt: &publishedAt,
		Address:  "Test street 1",
		Latitude: 41.3, Longitude: 69.2,
	}
	if err := tx.Create(apartment).Error; err != nil {
		t.Fatalf("create apartment: %v", err)
	}
	return owner, apartment
}

func TestUserEmailIsUnique(t *testing.T) {
	withRollback(t, func(tx *gorm.DB) {
		first := newUser()
		if err := tx.Create(first).Error; err != nil {
			t.Fatalf("create first user: %v", err)
		}

		duplicate := newUser()
		duplicate.Email = first.Email

		if err := tx.Create(duplicate).Error; !isUniqueViolation(err) {
			t.Fatalf("expected a unique violation on email, got %v", err)
		}
	})
}

func TestUserPhoneIsUnique(t *testing.T) {
	withRollback(t, func(tx *gorm.DB) {
		first := newUser()
		if err := tx.Create(first).Error; err != nil {
			t.Fatalf("create first user: %v", err)
		}

		duplicate := newUser()
		duplicate.Phone = first.Phone

		if err := tx.Create(duplicate).Error; !isUniqueViolation(err) {
			t.Fatalf("expected a unique violation on phone, got %v", err)
		}
	})
}

func TestDistrictSlugIsUnique(t *testing.T) {
	withRollback(t, func(tx *gorm.DB) {
		slug := unique("district-")
		first := &models.District{Name: unique("D "), Slug: slug, Latitude: 41, Longitude: 69}
		if err := tx.Create(first).Error; err != nil {
			t.Fatalf("create first district: %v", err)
		}

		duplicate := &models.District{Name: unique("D "), Slug: slug, Latitude: 41, Longitude: 69}
		if err := tx.Create(duplicate).Error; !isUniqueViolation(err) {
			t.Fatalf("expected a unique violation on district slug, got %v", err)
		}
	})
}

func TestAmenitySlugIsUnique(t *testing.T) {
	withRollback(t, func(tx *gorm.DB) {
		slug := unique("amenity-")
		if err := tx.Create(&models.Amenity{Name: unique("A "), Slug: slug}).Error; err != nil {
			t.Fatalf("create first amenity: %v", err)
		}

		duplicate := &models.Amenity{Name: unique("A "), Slug: slug}
		if err := tx.Create(duplicate).Error; !isUniqueViolation(err) {
			t.Fatalf("expected a unique violation on amenity slug, got %v", err)
		}
	})
}

func TestFavoriteIsUniquePerUserAndApartment(t *testing.T) {
	withRollback(t, func(tx *gorm.DB) {
		owner, apartment := seedApartment(t, tx)

		first := &models.Favorite{UserID: owner.ID, ApartmentID: apartment.ID}
		if err := tx.Create(first).Error; err != nil {
			t.Fatalf("create first favorite: %v", err)
		}

		duplicate := &models.Favorite{UserID: owner.ID, ApartmentID: apartment.ID}
		if err := tx.Create(duplicate).Error; !isUniqueViolation(err) {
			t.Fatalf("expected a unique violation on (user_id, apartment_id), got %v", err)
		}
	})
}

func TestApartmentAmenityIsUnique(t *testing.T) {
	withRollback(t, func(tx *gorm.DB) {
		_, apartment := seedApartment(t, tx)

		amenity := &models.Amenity{Name: unique("A "), Slug: unique("amenity-")}
		if err := tx.Create(amenity).Error; err != nil {
			t.Fatalf("create amenity: %v", err)
		}

		link := &models.ApartmentAmenity{ApartmentID: apartment.ID, AmenityID: amenity.ID}
		if err := tx.Create(link).Error; err != nil {
			t.Fatalf("create first link: %v", err)
		}

		duplicate := &models.ApartmentAmenity{ApartmentID: apartment.ID, AmenityID: amenity.ID}
		if err := tx.Create(duplicate).Error; !isUniqueViolation(err) {
			t.Fatalf("expected a unique violation on (apartment_id, amenity_id), got %v", err)
		}
	})
}

func TestConversationParticipantIsUnique(t *testing.T) {
	withRollback(t, func(tx *gorm.DB) {
		owner, apartment := seedApartment(t, tx)

		// Since 0004 a conversation names the person who opened it, so one has
		// to exist before the thread does.
		buyer := newUser()
		if err := tx.Create(buyer).Error; err != nil {
			t.Fatalf("create buyer: %v", err)
		}

		conversation := &models.Conversation{ApartmentID: apartment.ID, BuyerID: buyer.ID}
		if err := tx.Create(conversation).Error; err != nil {
			t.Fatalf("create conversation: %v", err)
		}

		first := &models.ConversationParticipant{ConversationID: conversation.ID, UserID: owner.ID}
		if err := tx.Create(first).Error; err != nil {
			t.Fatalf("add first participant: %v", err)
		}

		duplicate := &models.ConversationParticipant{ConversationID: conversation.ID, UserID: owner.ID}
		if err := tx.Create(duplicate).Error; !isUniqueViolation(err) {
			t.Fatalf("expected a unique violation on (conversation_id, user_id), got %v", err)
		}
	})
}

func TestConversationSupportsMoreThanTwoParticipants(t *testing.T) {
	withRollback(t, func(tx *gorm.DB) {
		owner, apartment := seedApartment(t, tx)

		// Since 0004 a conversation names the person who opened it, so one has
		// to exist before the thread does.
		buyer := newUser()
		if err := tx.Create(buyer).Error; err != nil {
			t.Fatalf("create buyer: %v", err)
		}

		conversation := &models.Conversation{ApartmentID: apartment.ID, BuyerID: buyer.ID}
		if err := tx.Create(conversation).Error; err != nil {
			t.Fatalf("create conversation: %v", err)
		}

		participants := []uuid.UUID{owner.ID}
		for i := 0; i < 2; i++ {
			extra := newUser()
			if err := tx.Create(extra).Error; err != nil {
				t.Fatalf("create extra user: %v", err)
			}
			participants = append(participants, extra.ID)
		}
		for _, id := range participants {
			link := &models.ConversationParticipant{ConversationID: conversation.ID, UserID: id}
			if err := tx.Create(link).Error; err != nil {
				t.Fatalf("add participant: %v", err)
			}
		}

		var count int64
		tx.Model(&models.ConversationParticipant{}).
			Where("conversation_id = ?", conversation.ID).Count(&count)
		if count != 3 {
			t.Fatalf("got %d participants, want 3 — the schema must not cap a thread at two", count)
		}
	})
}

func TestDeletingAnApartmentLeavesNoOrphans(t *testing.T) {
	withRollback(t, func(tx *gorm.DB) {
		owner, apartment := seedApartment(t, tx)

		if err := tx.Create(&models.ApartmentImage{
			ApartmentID: apartment.ID, URL: "https://example.test/a.jpg", IsPrimary: true,
		}).Error; err != nil {
			t.Fatalf("create image: %v", err)
		}
		if err := tx.Create(&models.Favorite{UserID: owner.ID, ApartmentID: apartment.ID}).Error; err != nil {
			t.Fatalf("create favorite: %v", err)
		}
		amenity := &models.Amenity{Name: unique("A "), Slug: unique("amenity-")}
		if err := tx.Create(amenity).Error; err != nil {
			t.Fatalf("create amenity: %v", err)
		}
		if err := tx.Create(&models.ApartmentAmenity{
			ApartmentID: apartment.ID, AmenityID: amenity.ID,
		}).Error; err != nil {
			t.Fatalf("link amenity: %v", err)
		}
		// Since 0004 a conversation names the person who opened it, so one has
		// to exist before the thread does.
		buyer := newUser()
		if err := tx.Create(buyer).Error; err != nil {
			t.Fatalf("create buyer: %v", err)
		}

		conversation := &models.Conversation{ApartmentID: apartment.ID, BuyerID: buyer.ID}
		if err := tx.Create(conversation).Error; err != nil {
			t.Fatalf("create conversation: %v", err)
		}
		if err := tx.Create(&models.Message{
			ConversationID: conversation.ID, SenderID: owner.ID, Body: "hello",
		}).Error; err != nil {
			t.Fatalf("create message: %v", err)
		}

		if err := tx.Delete(&models.Apartment{}, "id = ?", apartment.ID).Error; err != nil {
			t.Fatalf("delete apartment: %v", err)
		}

		for _, c := range []struct {
			label string
			model any
			where string
			arg   any
		}{
			{"images", &models.ApartmentImage{}, "apartment_id = ?", apartment.ID},
			{"favorites", &models.Favorite{}, "apartment_id = ?", apartment.ID},
			{"amenity links", &models.ApartmentAmenity{}, "apartment_id = ?", apartment.ID},
			{"conversations", &models.Conversation{}, "apartment_id = ?", apartment.ID},
			{"messages", &models.Message{}, "conversation_id = ?", conversation.ID},
		} {
			var count int64
			tx.Model(c.model).Where(c.where, c.arg).Count(&count)
			if count != 0 {
				t.Errorf("%d orphaned %s remain after deleting the apartment", count, c.label)
			}
		}

		// The amenity itself is reference data and must survive.
		var amenities int64
		tx.Model(&models.Amenity{}).Where("id = ?", amenity.ID).Count(&amenities)
		if amenities != 1 {
			t.Error("the amenity was deleted; only the link should have been removed")
		}
	})
}

func TestDistrictInUseCannotBeDeleted(t *testing.T) {
	withRollback(t, func(tx *gorm.DB) {
		_, apartment := seedApartment(t, tx)

		// A RESTRICT foreign key raises restrict_violation (23001); a deferred or
		// plain reference would raise foreign_key_violation (23503). Either means
		// the district was protected.
		err := tx.Delete(&models.District{}, "id = ?", apartment.DistrictID).Error
		if err == nil ||
			!(strings.Contains(err.Error(), "SQLSTATE 23001") ||
				strings.Contains(err.Error(), "SQLSTATE 23503")) {
			t.Fatalf("expected the district to be protected while in use, got %v", err)
		}
	})
}

func TestOnlyOnePrimaryImagePerApartment(t *testing.T) {
	withRollback(t, func(tx *gorm.DB) {
		_, apartment := seedApartment(t, tx)

		first := &models.ApartmentImage{ApartmentID: apartment.ID, URL: "https://example.test/a.jpg", IsPrimary: true}
		if err := tx.Create(first).Error; err != nil {
			t.Fatalf("create first cover: %v", err)
		}

		second := &models.ApartmentImage{ApartmentID: apartment.ID, URL: "https://example.test/b.jpg", IsPrimary: true}
		if err := tx.Create(second).Error; !isUniqueViolation(err) {
			t.Fatalf("expected a unique violation on a second cover image, got %v", err)
		}
	})
}

func TestApartmentStatusCheckConstraint(t *testing.T) {
	withRollback(t, func(tx *gorm.DB) {
		owner, apartment := seedApartment(t, tx)

		bad := &models.Apartment{
			OwnerID: owner.ID, DistrictID: apartment.DistrictID,
			Title: "Bad status", Price: decimal.NewFromInt(1000),
			Currency: models.CurrencyUZS, RentalPeriod: models.RentalPeriodMonthly,
			Rooms: 1, Area: 30, Floor: 1, TotalFloors: 5,
			Status: "sold", Address: "x", Latitude: 41, Longitude: 69,
		}

		// "sold" fits varchar(10), so the CHECK constraint is what rejects it
		// rather than the column length.
		err := tx.Create(bad).Error
		if err == nil || !strings.Contains(err.Error(), "SQLSTATE 23514") {
			t.Fatalf("expected a check violation on status, got %v", err)
		}
	})
}
