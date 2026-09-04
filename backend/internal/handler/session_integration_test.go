//go:build integration

// Sessions: renewing one, ending one, and what happens to one that should not
// work any more.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run Session
//
// These exist because a session used to be one JWT and nothing else: signing
// out could only forget it locally, and a token that leaked was good until it
// expired. Everything asserted here is the difference that makes.
package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
)

// sha256Hex mirrors how the service stores a refresh token, so a test can find
// the row for a token it holds.
func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

// signedIn registers an account and returns its tokens.
func signedIn(t *testing.T, h *harness) (access, refresh string) {
	t.Helper()
	auth := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())
	if auth.RefreshToken == "" {
		t.Fatal("registration returned no refresh token")
	}
	return auth.AccessToken, auth.RefreshToken
}

func TestSessionRenews(t *testing.T) {
	h := newHarness(t)
	_, refresh := signedIn(t, h)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/refresh",
		map[string]any{"refresh_token": refresh}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("refresh: got %d, want 200 (%s)", rec.Code, rec.Body.String())
	}

	var renewed dto.AuthResponse
	if err := json.Unmarshal(decode(t, rec).Data, &renewed); err != nil {
		t.Fatalf("decode renewal: %v", err)
	}

	if renewed.AccessToken == "" {
		t.Error("renewal returned no access token")
	}
	// Rotation: the token just used must not come back.
	if renewed.RefreshToken == "" || renewed.RefreshToken == refresh {
		t.Error("the refresh token was not rotated")
	}

	// The new access token works.
	me := h.do(t, http.MethodGet, "/api/v1/auth/me", nil, "Bearer "+renewed.AccessToken)
	if me.Code != http.StatusOK {
		t.Fatalf("the renewed access token was refused: %d", me.Code)
	}
}

func TestSessionRefreshTokenIsSingleUse(t *testing.T) {
	h := newHarness(t)
	_, refresh := signedIn(t, h)

	first := h.do(t, http.MethodPost, "/api/v1/auth/refresh",
		map[string]any{"refresh_token": refresh}, "")
	if first.Code != http.StatusOK {
		t.Fatalf("first refresh: got %d, want 200", first.Code)
	}
	var renewed dto.AuthResponse
	if err := json.Unmarshal(decode(t, first).Data, &renewed); err != nil {
		t.Fatalf("decode renewal: %v", err)
	}

	// The same token again is a replay.
	second := h.do(t, http.MethodPost, "/api/v1/auth/refresh",
		map[string]any{"refresh_token": refresh}, "")
	if second.Code != http.StatusUnauthorized {
		t.Fatalf("replayed refresh: got %d, want 401", second.Code)
	}

	// And a replay ends every session this account has, including the one the
	// replay was racing: whoever holds the old token may hold the new one too.
	third := h.do(t, http.MethodPost, "/api/v1/auth/refresh",
		map[string]any{"refresh_token": renewed.RefreshToken}, "")
	if third.Code != http.StatusUnauthorized {
		t.Fatalf("after a replay the successor still worked: got %d, want 401", third.Code)
	}
}

func TestSessionLogoutEndsIt(t *testing.T) {
	h := newHarness(t)
	_, refresh := signedIn(t, h)

	out := h.do(t, http.MethodPost, "/api/v1/auth/logout",
		map[string]any{"refresh_token": refresh}, "")
	if out.Code != http.StatusOK {
		t.Fatalf("logout: got %d, want 200 (%s)", out.Code, out.Body.String())
	}

	// The session cannot be renewed afterwards — which is the whole point.
	again := h.do(t, http.MethodPost, "/api/v1/auth/refresh",
		map[string]any{"refresh_token": refresh}, "")
	if again.Code != http.StatusUnauthorized {
		t.Fatalf("a signed-out session renewed: got %d, want 401", again.Code)
	}

	// Signing out twice is not a failure.
	repeat := h.do(t, http.MethodPost, "/api/v1/auth/logout",
		map[string]any{"refresh_token": refresh}, "")
	if repeat.Code != http.StatusOK {
		t.Fatalf("second logout: got %d, want 200", repeat.Code)
	}
}

func TestSessionRejectsNonsense(t *testing.T) {
	h := newHarness(t)

	cases := []struct {
		name string
		body map[string]any
		want int
	}{
		{"a token nobody issued", map[string]any{
			"refresh_token": "abcdefghijklmnopqrstuvwxyz012345",
		}, http.StatusUnauthorized},
		{"an empty token", map[string]any{"refresh_token": ""}, http.StatusBadRequest},
		{"no token at all", map[string]any{}, http.StatusBadRequest},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			rec := h.do(t, http.MethodPost, "/api/v1/auth/refresh", testCase.body, "")
			if rec.Code != testCase.want {
				t.Fatalf("got %d, want %d (%s)", rec.Code, testCase.want, rec.Body.String())
			}
		})
	}
}

func TestSessionExpires(t *testing.T) {
	h := newHarness(t)
	_, refresh := signedIn(t, h)

	// Aged past its expiry in place, which is the one thing a test cannot wait
	// for. Everything else about the row is untouched.
	sessions := repository.NewRefreshTokenRepository(h.db)
	stored, err := sessions.FindByHash(t.Context(), sha256Hex(refresh))
	if err != nil {
		t.Fatalf("find session: %v", err)
	}
	h.db.Model(&models.RefreshToken{}).Where("id = ?", stored.ID).
		Update("expires_at", time.Now().UTC().Add(-time.Hour))

	rec := h.do(t, http.MethodPost, "/api/v1/auth/refresh",
		map[string]any{"refresh_token": refresh}, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("an expired session renewed: got %d, want 401", rec.Code)
	}
}
