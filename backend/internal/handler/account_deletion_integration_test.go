//go:build integration

// Deleting your own account: what it does to sign-in, to open sessions, and
// to listings that were still live.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run DeleteAccount
package handler

import (
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/shopspring/decimal"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// ownedListing creates a minimal, valid listing for the given owner, in the
// given status, so a test can check what deletion does to it without going
// through the owner-listing API this package does not mount.
func (h *harness) ownedListing(t *testing.T, ownerID uuid.UUID, status string) uuid.UUID {
	t.Helper()

	var district models.District
	if err := h.db.First(&district).Error; err != nil {
		district = models.District{Name: "Test district", Slug: "test-district-deletion"}
		if err := h.db.Create(&district).Error; err != nil {
			t.Fatalf("create fixture district: %v", err)
		}
	}

	listing := models.Apartment{
		OwnerID: ownerID, DistrictID: district.ID,
		Title:       "Fixture listing for account-deletion tests",
		Description: "Created by a test and never shown to anybody.",
		Price:       decimal.NewFromInt(3000000), Currency: "UZS", RentalPeriod: "monthly",
		Rooms: 1, Area: 40, Floor: 2, TotalFloors: 5,
		Address: "Test address 1", Latitude: 41.31, Longitude: 69.24,
		Utilities: models.UtilitiesIncluded, Rules: pq.StringArray{},
		Status: status,
	}
	if status == models.ApartmentStatusActive {
		published := time.Now().UTC()
		listing.PublishedAt = &published
	}
	if err := h.db.Create(&listing).Error; err != nil {
		t.Fatalf("create fixture listing: %v", err)
	}
	return listing.ID
}

func (h *harness) listingStatus(t *testing.T, id uuid.UUID) string {
	t.Helper()
	var listing models.Apartment
	if err := h.db.First(&listing, "id = ?", id).Error; err != nil {
		t.Fatalf("reload listing: %v", err)
	}
	return listing.Status
}

func TestDeleteAccountAnonymizesAndRefusesFurtherSignIn(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()
	auth := h.registerFully(t, models.VerificationMethodEmail, email)
	userID := auth.User.ID

	rec := h.do(t, http.MethodDelete, "/api/v1/me",
		map[string]any{"password": testPassword}, "Bearer "+auth.AccessToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete: got %d, want 200 (%s)", rec.Code, rec.Body.String())
	}

	// The old identifier no longer reaches this account.
	login := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": email, "password": testPassword}, "")
	if login.Code != http.StatusUnauthorized {
		t.Fatalf("login with the old email: got %d, want 401", login.Code)
	}

	// The row is still there, just not this person any more.
	var user models.User
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		t.Fatalf("reload user: %v", err)
	}
	if user.Status != models.UserStatusDeleted {
		t.Fatalf("status = %q, want %q", user.Status, models.UserStatusDeleted)
	}
	if user.DeletedAt == nil {
		t.Fatal("deleted_at was not set")
	}
	if user.Email == nil || *user.Email == email {
		t.Fatal("the email was not replaced")
	}
	if user.Phone != nil {
		t.Fatal("the phone was not cleared")
	}
	if user.PasswordHash == "" {
		t.Fatal("the password hash was cleared instead of replaced")
	}
}

func TestDeleteAccountRefusesTheWrongPassword(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()
	auth := h.registerFully(t, models.VerificationMethodEmail, email)

	rec := h.do(t, http.MethodDelete, "/api/v1/me",
		map[string]any{"password": "NotThePassword123"}, "Bearer "+auth.AccessToken)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401 (%s)", rec.Code, rec.Body.String())
	}

	// Refused, so the account must be exactly as it was.
	login := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": email, "password": testPassword}, "")
	if login.Code != http.StatusOK {
		t.Fatalf("the account was affected by a refused deletion: login got %d", login.Code)
	}
}

func TestDeleteAccountRevokesTheRefreshToken(t *testing.T) {
	h := newHarness(t)
	auth := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())

	if rec := h.do(t, http.MethodDelete, "/api/v1/me",
		map[string]any{"password": testPassword}, "Bearer "+auth.AccessToken); rec.Code != http.StatusOK {
		t.Fatalf("delete: got %d, want 200", rec.Code)
	}

	renew := h.do(t, http.MethodPost, "/api/v1/auth/refresh",
		map[string]any{"refresh_token": auth.RefreshToken}, "")
	if renew.Code != http.StatusUnauthorized {
		t.Fatalf("a deleted account's session renewed: got %d, want 401", renew.Code)
	}
}

func TestDeleteAccountRejectsAMissingPassword(t *testing.T) {
	h := newHarness(t)
	auth := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())

	rec := h.do(t, http.MethodDelete, "/api/v1/me", map[string]any{}, "Bearer "+auth.AccessToken)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400 (%s)", rec.Code, rec.Body.String())
	}
}

func TestDeleteAccountRequiresAuthentication(t *testing.T) {
	h := newHarness(t)
	rec := h.do(t, http.MethodDelete, "/api/v1/me", map[string]any{"password": "whatever"}, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

// Deleting an already-deleted account is not the same as logging out twice:
// the password was scrambled the first time, so nobody — including the
// person who just did it — can supply the one now on file.
func TestDeleteAccountCannotBeRepeated(t *testing.T) {
	h := newHarness(t)
	auth := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())

	first := h.do(t, http.MethodDelete, "/api/v1/me",
		map[string]any{"password": testPassword}, "Bearer "+auth.AccessToken)
	if first.Code != http.StatusOK {
		t.Fatalf("first delete: got %d, want 200", first.Code)
	}

	second := h.do(t, http.MethodDelete, "/api/v1/me",
		map[string]any{"password": testPassword}, "Bearer "+auth.AccessToken)
	if second.Code != http.StatusUnauthorized {
		t.Fatalf("second delete: got %d, want 401 (%s)", second.Code, second.Body.String())
	}
}

func TestDeleteAccountClosesPublishedListingsButLeavesDrafts(t *testing.T) {
	h := newHarness(t)
	auth := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())
	userID, err := uuid.Parse(auth.User.ID)
	if err != nil {
		t.Fatalf("parse user id: %v", err)
	}

	active := h.ownedListing(t, userID, models.ApartmentStatusActive)
	pending := h.ownedListing(t, userID, models.ApartmentStatusPending)
	draft := h.ownedListing(t, userID, models.ApartmentStatusDraft)

	if rec := h.do(t, http.MethodDelete, "/api/v1/me",
		map[string]any{"password": testPassword}, "Bearer "+auth.AccessToken); rec.Code != http.StatusOK {
		t.Fatalf("delete: got %d, want 200", rec.Code)
	}

	if got := h.listingStatus(t, active); got != models.ApartmentStatusClosed {
		t.Errorf("active listing: got status %q, want closed", got)
	}
	if got := h.listingStatus(t, pending); got != models.ApartmentStatusClosed {
		t.Errorf("pending listing: got status %q, want closed", got)
	}
	if got := h.listingStatus(t, draft); got != models.ApartmentStatusDraft {
		t.Errorf("draft listing: got status %q, want left as draft", got)
	}
}
