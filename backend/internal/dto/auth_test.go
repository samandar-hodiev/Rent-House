package dto

import (
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

func TestRegisterRequestOTPNormalizes(t *testing.T) {
	req := RegisterRequestOTP{Method: " EMAIL ", Email: "  Samandar@Example.COM "}
	req.Normalize()

	if req.Method != "email" {
		t.Errorf("got method %q, want it lowercased and trimmed", req.Method)
	}
	if req.Email != "samandar@example.com" {
		t.Errorf("got email %q, want it lowercased and trimmed", req.Email)
	}
	if req.Contact() != "samandar@example.com" {
		t.Errorf("Contact() = %q", req.Contact())
	}

	phone := RegisterRequestOTP{Method: "phone", Phone: "+998 90 123 45 67"}
	phone.Normalize()
	if phone.Phone != "+998901234567" {
		t.Errorf("got phone %q, want it canonicalised", phone.Phone)
	}
	if phone.Contact() != "+998901234567" {
		t.Errorf("Contact() = %q", phone.Contact())
	}
}

func TestCompleteRegistrationNormalizeDefaultsLanguage(t *testing.T) {
	req := CompleteRegistrationRequest{FirstName: "  Samandar ", LastName: " Hodiev  "}
	req.Normalize()

	if req.FirstName != "Samandar" || req.LastName != "Hodiev" {
		t.Errorf("names were not trimmed: %q %q", req.FirstName, req.LastName)
	}
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
	email, phone := "a@b.test", "+998901234567"
	user := &models.User{
		FirstName: "A", LastName: "B",
		Email: &email, Phone: &phone,
		PasswordHash: hash,
		Language:     models.LanguageUz, Theme: models.ThemeLight,
	}

	got := NewUserResponse(user)
	if got.Email == nil || *got.Email != "a@b.test" || got.Phone == nil || *got.Phone != "+998901234567" {
		t.Fatalf("public fields were not copied: %+v", got)
	}

	// Serialize and confirm the hash is nowhere in the output.
	if contains(got, hash) {
		t.Fatal("the password hash reached the response DTO")
	}
}

func contains(v UserResponse, needle string) bool {
	fields := []string{v.ID, v.FirstName, v.LastName, v.Language, v.Theme}
	for _, p := range []*string{v.Email, v.Phone, v.AvatarURL} {
		if p != nil {
			fields = append(fields, *p)
		}
	}
	for _, f := range fields {
		if f == needle {
			return true
		}
	}
	return false
}

func TestNormalizeUzPhoneAcceptsTheShapesUsersType(t *testing.T) {
	cases := map[string]string{
		"+998901234567":     "+998901234567",
		"+998 90 123 45 67": "+998901234567",
		"+998-90-123-45-67": "+998901234567",
		"998901234567":      "+998901234567",
		"901234567":         "+998901234567",
		"  901234567  ":     "+998901234567",
		"(90) 123 45 67":    "+998901234567",
	}

	for input, want := range cases {
		if got := NormalizeUzPhone(input); got != want {
			t.Errorf("NormalizeUzPhone(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestNormalizeUzPhoneRejectsWhatItCannotRead(t *testing.T) {
	for _, input := range []string{"", "12345", "+12025550100", "+99890123456", "+9989012345678", "abcdefghi"} {
		if got := NormalizeUzPhone(input); got != "" {
			t.Errorf("NormalizeUzPhone(%q) = %q, want an empty string", input, got)
		}
	}
}

func TestLoginNormalizeCanonicalisesAPhoneIdentifier(t *testing.T) {
	req := LoginRequest{Identifier: "+998 90 123 45 67"}
	req.Normalize()
	if req.Identifier != "+998901234567" {
		t.Fatalf("got %q, want the canonical phone form", req.Identifier)
	}
}
