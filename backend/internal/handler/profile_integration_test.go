//go:build integration

// Editing your own profile, end to end against PostgreSQL.
//
// The account edited is the one the token names, so most of what these check is
// that a person can change what is theirs and nothing else: not another
// account's phone number, not their own way of signing in, and not an avatar
// pointing at a server this one does not control.
package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

func (h *harness) patchProfile(t *testing.T, token string, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	return h.do(t, http.MethodPatch, "/api/v1/me", body, token)
}

func (h *harness) profileOK(t *testing.T, token string, body map[string]any) dto.UserResponse {
	t.Helper()
	rec := h.patchProfile(t, token, body)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch profile got status %d: %s", rec.Code, rec.Body.String())
	}
	var user dto.UserResponse
	if err := json.Unmarshal(decode(t, rec).Data, &user); err != nil {
		t.Fatalf("decode user: %v", err)
	}
	return user
}

// signedUp registers an account and returns its bearer header.
func (h *harness) signedUp(t *testing.T) (string, dto.AuthResponse) {
	t.Helper()
	auth := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())
	return "Bearer " + auth.AccessToken, auth
}

func TestProfileNameIsSavedAndReadBack(t *testing.T) {
	h := newHarness(t)
	token, _ := h.signedUp(t)

	updated := h.profileOK(t, token, map[string]any{
		"first_name": "Samandar",
		"last_name":  "Hodiev",
	})
	if updated.FirstName != "Samandar" || updated.LastName != "Hodiev" {
		t.Fatalf("response carries %q %q", updated.FirstName, updated.LastName)
	}

	// Persisted, not just echoed: the name is what the rest of the application
	// reads from /auth/me on every load.
	rec := h.do(t, http.MethodGet, "/api/v1/auth/me", nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("me got status %d", rec.Code)
	}
	var me dto.UserResponse
	if err := json.Unmarshal(decode(t, rec).Data, &me); err != nil {
		t.Fatalf("decode me: %v", err)
	}
	if me.FirstName != "Samandar" || me.LastName != "Hodiev" {
		t.Fatalf("stored name is %q %q", me.FirstName, me.LastName)
	}
}

// A field the form did not touch must survive the save.
func TestProfileOmittedFieldsAreLeftAlone(t *testing.T) {
	h := newHarness(t)
	token, auth := h.signedUp(t)

	h.profileOK(t, token, map[string]any{"phone": "+998901234599"})
	updated := h.profileOK(t, token, map[string]any{"first_name": "Yangi"})

	if updated.Phone == nil || *updated.Phone != "+998901234599" {
		t.Fatalf("phone was lost by a name-only save: %v", updated.Phone)
	}
	if updated.Email == nil || *updated.Email != *auth.User.Email {
		t.Fatalf("email changed: %v", updated.Email)
	}
}

func TestProfileNameCannotBeEmptied(t *testing.T) {
	h := newHarness(t)
	token, _ := h.signedUp(t)

	for _, body := range []map[string]any{
		{"first_name": ""},
		{"last_name": "   "},
	} {
		if rec := h.patchProfile(t, token, body); rec.Code == http.StatusOK {
			t.Fatalf("an empty name was accepted: %v", body)
		}
	}
}

func TestProfilePhoneIsNormalizedAndValidated(t *testing.T) {
	h := newHarness(t)
	token, _ := h.signedUp(t)

	// The shapes people actually type all reach the same stored value, which is
	// what makes the unique constraint mean anything.
	updated := h.profileOK(t, token, map[string]any{"phone": "90 123 45 77"})
	if updated.Phone == nil || *updated.Phone != "+998901234577" {
		t.Fatalf("phone stored as %v, want +998901234577", updated.Phone)
	}

	if rec := h.patchProfile(t, token, map[string]any{"phone": "12345"}); rec.Code == http.StatusOK {
		t.Fatal("a malformed phone number was accepted")
	}
}

// Two accounts cannot claim one number.
func TestProfilePhoneCannotBeTakenFromAnotherAccount(t *testing.T) {
	h := newHarness(t)
	first, _ := h.signedUp(t)
	second, _ := h.signedUp(t)

	h.profileOK(t, first, map[string]any{"phone": "+998901234588"})

	rec := h.patchProfile(t, second, map[string]any{"phone": "+998901234588"})
	if rec.Code != http.StatusConflict {
		t.Fatalf("claiming another account's number got status %d, want 409", rec.Code)
	}
}

// Removing the only way to sign in would lock the account out.
func TestProfilePhoneCannotBeClearedWhenItIsTheOnlyContact(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	auth := h.registerFully(t, models.VerificationMethodPhone, phone)
	token := "Bearer " + auth.AccessToken

	if rec := h.patchProfile(t, token, map[string]any{"phone": ""}); rec.Code == http.StatusOK {
		t.Fatal("an account cleared its only contact")
	}

	// Still reachable.
	updated := h.profileOK(t, token, map[string]any{"first_name": "Hali"})
	if updated.Phone == nil {
		t.Fatal("the phone number was cleared anyway")
	}
}

// An avatar is rendered in other people's browsers, so it may only ever name
// something this server serves.
func TestProfileAvatarMustBeAnUpload(t *testing.T) {
	h := newHarness(t)
	token, _ := h.signedUp(t)

	for _, bad := range []string{
		"https://evil.example/tracker.png",
		"https://evil.example/uploads/../tracker.png",
		"javascript:alert(1)",
		"/etc/passwd",
	} {
		if rec := h.patchProfile(t, token, map[string]any{"avatar_url": bad}); rec.Code == http.StatusOK {
			t.Fatalf("accepted an off-site avatar: %q", bad)
		}
	}

	// What the upload endpoint hands back is an absolute URL; only its path is
	// kept, so the origin is this server's to decide when it is read.
	updated := h.profileOK(t, token, map[string]any{
		"avatar_url": "http://localhost:8081/uploads/images/abc.jpg",
	})
	if updated.AvatarURL == nil || *updated.AvatarURL != "/uploads/images/abc.jpg" {
		t.Fatalf("avatar stored as %v, want the path only", updated.AvatarURL)
	}

	// And it can be taken off again.
	cleared := h.profileOK(t, token, map[string]any{"avatar_url": ""})
	if cleared.AvatarURL != nil {
		t.Fatalf("avatar was not cleared: %v", cleared.AvatarURL)
	}
}

func TestProfileRequiresAToken(t *testing.T) {
	h := newHarness(t)
	if rec := h.patchProfile(t, "", map[string]any{"first_name": "X"}); rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated patch got status %d, want 401", rec.Code)
	}
}
