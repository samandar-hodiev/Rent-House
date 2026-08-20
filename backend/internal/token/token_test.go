package token

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const testSecret = "test-secret-not-used-anywhere-real"

func newService(t *testing.T, ttl time.Duration) *Service {
	t.Helper()
	s, err := New(testSecret, ttl)
	if err != nil {
		t.Fatalf("build service: %v", err)
	}
	return s
}

func TestNewRejectsAnEmptySecret(t *testing.T) {
	if _, err := New("", time.Hour); err == nil {
		t.Fatal("an empty secret must be rejected; tokens would be forgeable")
	}
}

func TestNewRejectsNonPositiveExpiry(t *testing.T) {
	if _, err := New(testSecret, 0); err == nil {
		t.Fatal("a non-positive expiry must be rejected")
	}
}

func TestGenerateAndValidateRoundTrip(t *testing.T) {
	svc := newService(t, time.Hour)
	userID := uuid.New()

	raw, expiresAt, err := svc.Generate(userID)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if raw == "" {
		t.Fatal("generated token is empty")
	}
	if !expiresAt.After(time.Now()) {
		t.Fatal("expiry must be in the future")
	}

	got, err := svc.Validate(raw)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if got != userID {
		t.Fatalf("got subject %s, want %s", got, userID)
	}
}

func TestExpiredTokenIsRejected(t *testing.T) {
	svc := newService(t, time.Hour)
	userID := uuid.New()

	// Signed by hand so the expiry is already in the past.
	claims := jwt.RegisteredClaims{
		Subject:   userID.String(),
		IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
	}
	raw, err := jwt.NewWithClaims(signingMethod, claims).SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	if _, err := svc.Validate(raw); err != ErrExpiredToken {
		t.Fatalf("got %v, want ErrExpiredToken", err)
	}
}

func TestTokenSignedWithAnotherSecretIsRejected(t *testing.T) {
	svc := newService(t, time.Hour)

	other, err := New("a-completely-different-secret", time.Hour)
	if err != nil {
		t.Fatalf("build other service: %v", err)
	}
	raw, _, err := other.Generate(uuid.New())
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	if _, err := svc.Validate(raw); err != ErrInvalidToken {
		t.Fatalf("got %v, want ErrInvalidToken for a foreign signature", err)
	}
}

func TestUnsignedTokenIsRejected(t *testing.T) {
	svc := newService(t, time.Hour)

	// alg=none: the classic JWT bypass. Accepting the header's algorithm would
	// let this through with no signature at all.
	claims := jwt.RegisteredClaims{
		Subject:   uuid.New().String(),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}
	raw, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).
		SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("sign none: %v", err)
	}

	if _, err := svc.Validate(raw); err != ErrInvalidToken {
		t.Fatalf("got %v, want ErrInvalidToken for alg=none", err)
	}
}

func TestTokenWithADifferentHMACSizeIsRejected(t *testing.T) {
	svc := newService(t, time.Hour)

	claims := jwt.RegisteredClaims{
		Subject:   uuid.New().String(),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}
	raw, err := jwt.NewWithClaims(jwt.SigningMethodHS512, claims).SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("sign hs512: %v", err)
	}

	if _, err := svc.Validate(raw); err != ErrInvalidToken {
		t.Fatalf("got %v, want ErrInvalidToken for HS512 against an HS256 service", err)
	}
}

func TestMalformedTokenIsRejected(t *testing.T) {
	svc := newService(t, time.Hour)

	for _, raw := range []string{"", "not-a-token", "a.b", "a.b.c", "Bearer x.y.z"} {
		if _, err := svc.Validate(raw); err != ErrInvalidToken {
			t.Errorf("Validate(%q) = %v, want ErrInvalidToken", raw, err)
		}
	}
}

func TestSubjectMustBeAUUID(t *testing.T) {
	svc := newService(t, time.Hour)

	for _, subject := range []string{"", "not-a-uuid", "00000000-0000-0000-0000-000000000000"} {
		claims := jwt.RegisteredClaims{
			Subject:   subject,
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		}
		raw, err := jwt.NewWithClaims(signingMethod, claims).SignedString([]byte(testSecret))
		if err != nil {
			t.Fatalf("sign: %v", err)
		}
		if _, err := svc.Validate(raw); err != ErrInvalidToken {
			t.Errorf("subject %q was accepted, want ErrInvalidToken", subject)
		}
	}
}

func TestExpiresInReportsTheConfiguredLifetime(t *testing.T) {
	svc := newService(t, 90*time.Minute)
	if got := svc.ExpiresIn(); got != 90*time.Minute {
		t.Fatalf("got %v, want 90m", got)
	}
}
