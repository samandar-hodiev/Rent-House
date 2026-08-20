package dto

import (
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

func TestRegisterNormalizeLowercasesAndTrims(t *testing.T) {
	req := RegisterRequest{
		FirstName: "  Samandar ",
		LastName:  " Hodiev  ",
		Email:     "  Samandar@Example.COM ",
		Phone:     " +998901234567 ",
	}
	req.Normalize()

	if req.FirstName != "Samandar" || req.LastName != "Hodiev" {
		t.Errorf("names were not trimmed: %q %q", req.FirstName, req.LastName)
	}
	if req.Email != "samandar@example.com" {
		t.Errorf("got email %q, want it lowercased and trimmed", req.Email)
	}
	if req.Phone != "+998901234567" {
		t.Errorf("got phone %q, want it trimmed", req.Phone)
	}
}

func TestRegisterNormalizeDefaultsLanguage(t *testing.T) {
	req := RegisterRequest{}
	req.Normalize()

	if req.Language != models.LanguageUz {
		t.Fatalf("got language %q, want the %q default", req.Language, models.LanguageUz)
	}
}

func TestLoginNormalizeLowercasesOnlyEmails(t *testing.T) {
	email := LoginRequest{Identifier: "  Samandar@Example.COM "}
	email.Normalize()
	if email.Identifier != "samandar@example.com" {
		t.Errorf("got %q, want a lowercased email", email.Identifier)
	}

	// A phone number has no case to fold, and lowercasing it would be a no-op
	// today but a trap if identifiers ever include letters.
	phone := LoginRequest{Identifier: " +998901234567 "}
	phone.Normalize()
	if phone.Identifier != "+998901234567" {
		t.Errorf("got %q, want a trimmed phone number", phone.Identifier)
	}
}

func TestUzPhoneValidation(t *testing.T) {
	valid := []string{"+998901234567", "+998330001122", "+998999999999"}
	for _, phone := range valid {
		if !IsValidUzPhone(phone) {
			t.Errorf("%q should be accepted", phone)
		}
	}

	invalid := []string{
		"",
		"998901234567",      // no plus
		"+99890123456",      // too short
		"+9989012345678",    // too long
		"+1234567890123",    // wrong country code
		"+998 90 123 45 67", // spaces
		"+998abcdefghi",     // letters
	}
	for _, phone := range invalid {
		if IsValidUzPhone(phone) {
			t.Errorf("%q should be rejected", phone)
		}
	}
}

func TestUserResponseCarriesNoPasswordField(t *testing.T) {
	// A compile-time guarantee would be better, but reflecting over the struct
	// catches a future field named anything password-like.
	hash := "should-never-appear"
	user := &models.User{
		FirstName: "A", LastName: "B",
		Email: "a@b.test", Phone: "+998901234567",
		PasswordHash: hash,
		Language:     models.LanguageUz, Theme: models.ThemeLight,
	}

	got := NewUserResponse(user)
	if got.Email != "a@b.test" || got.Phone != "+998901234567" {
		t.Fatalf("public fields were not copied: %+v", got)
	}

	// Serialize and confirm the hash is nowhere in the output.
	if contains(got, hash) {
		t.Fatal("the password hash reached the response DTO")
	}
}

func contains(v UserResponse, needle string) bool {
	fields := []string{v.ID, v.FirstName, v.LastName, v.Email, v.Phone, v.Language, v.Theme}
	if v.AvatarURL != nil {
		fields = append(fields, *v.AvatarURL)
	}
	for _, f := range fields {
		if f == needle {
			return true
		}
	}
	return false
}
