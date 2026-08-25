//go:build integration

// Password reset by email, end to end against PostgreSQL.
//
// Two properties matter more than the happy path and are what most of these
// check: the endpoint must not become a way to ask which addresses are
// registered, and a link must work exactly once.
package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

func (h *harness) forgot(t *testing.T, email string) *httptest.ResponseRecorder {
	t.Helper()
	return h.do(t, http.MethodPost, "/api/v1/auth/password/forgot",
		map[string]any{"email": email}, "")
}

func (h *harness) validateToken(t *testing.T, token string) int {
	t.Helper()
	return h.do(t, http.MethodGet, "/api/v1/auth/password/reset?token="+token, nil, "").Code
}

func (h *harness) reset(t *testing.T, token, password string) int {
	t.Helper()
	return h.do(t, http.MethodPost, "/api/v1/auth/password/reset",
		map[string]any{"token": token, "password": password}, "").Code
}

// The development sender writes what it would have delivered; for a reset that
// is the link, and the token is the part after `token=`.
func (h *harness) resetTokenFor(t *testing.T, email string) string {
	t.Helper()
	if rec := h.forgot(t, email); rec.Code != http.StatusOK {
		t.Fatalf("forgot got status %d: %s", rec.Code, rec.Body.String())
	}
	sent := h.codes.lastSent(t, email)
	_, token, found := strings.Cut(sent, "token=")
	if !found {
		t.Fatalf("no reset link was sent, got %q", sent)
	}
	return token
}

func TestPasswordResetChangesThePassword(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()
	h.registerFully(t, models.VerificationMethodEmail, email)

	token := h.resetTokenFor(t, email)
	if code := h.validateToken(t, token); code != http.StatusOK {
		t.Fatalf("a fresh token was rejected: status %d", code)
	}
	if code := h.reset(t, token, "YangiParol123!"); code != http.StatusOK {
		t.Fatalf("reset got status %d", code)
	}

	// The new password works.
	rec := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]any{"identifier": email, "password": "YangiParol123!"}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("login with the new password got status %d: %s", rec.Code, rec.Body.String())
	}

	// And the old one does not.
	rec = h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]any{"identifier": email, "password": testPassword}, "")
	if rec.Code == http.StatusOK {
		t.Fatal("the old password still works after a reset")
	}
}

// A link is spent by the reset it performs.
func TestResetLinkWorksOnlyOnce(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()
	h.registerFully(t, models.VerificationMethodEmail, email)

	token := h.resetTokenFor(t, email)
	if code := h.reset(t, token, "BirinchiParol1!"); code != http.StatusOK {
		t.Fatalf("first reset got status %d", code)
	}

	if code := h.validateToken(t, token); code == http.StatusOK {
		t.Fatal("a spent token still validates")
	}
	if code := h.reset(t, token, "IkkinchiParol1!"); code == http.StatusOK {
		t.Fatal("a spent token reset the password a second time")
	}

	// The first password is still the live one.
	rec := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]any{"identifier": email, "password": "BirinchiParol1!"}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("the password from the first reset stopped working: status %d", rec.Code)
	}
}

// Requesting a second link invalidates the first, so only the newest one works.
func TestRequestingAgainInvalidatesTheEarlierLink(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()
	h.registerFully(t, models.VerificationMethodEmail, email)

	first := h.resetTokenFor(t, email)
	second := h.resetTokenFor(t, email)

	if first == second {
		t.Fatal("the second request reused the first token")
	}
	if code := h.validateToken(t, first); code == http.StatusOK {
		t.Fatal("the superseded link still works")
	}
	if code := h.validateToken(t, second); code != http.StatusOK {
		t.Fatalf("the newest link does not work: status %d", code)
	}
}

// The endpoint must not report whether an address is registered.
func TestForgotPasswordDoesNotRevealWhetherTheAccountExists(t *testing.T) {
	h := newHarness(t)
	known := uniqueEmail()
	h.registerFully(t, models.VerificationMethodEmail, known)
	unknown := uniqueEmail()

	withAccount := h.forgot(t, known)
	without := h.forgot(t, unknown)

	if withAccount.Code != http.StatusOK || without.Code != http.StatusOK {
		t.Fatalf("statuses differ: known=%d unknown=%d", withAccount.Code, without.Code)
	}
	if withAccount.Body.String() != without.Body.String() {
		t.Fatalf("responses differ:\n known: %s\n unknown: %s",
			withAccount.Body.String(), without.Body.String())
	}

	// And nothing was sent to the address that has no account.
	if sent := h.codes.lastOrEmpty(unknown); sent != "" {
		t.Fatalf("a message was sent to an unregistered address: %q", sent)
	}
}

func TestResetRejectsUnknownAndMalformedTokens(t *testing.T) {
	h := newHarness(t)

	for _, token := range []string{
		"", "not-a-token", strings.Repeat("a", 64),
	} {
		if code := h.validateToken(t, token); code == http.StatusOK {
			t.Fatalf("validated a bad token: %q", token)
		}
		if code := h.reset(t, token, "YangiParol123!"); code == http.StatusOK {
			t.Fatalf("reset with a bad token: %q", token)
		}
	}
}

// The same minimum registration enforces, so a reset cannot weaken an account.
func TestResetEnforcesThePasswordMinimum(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()
	h.registerFully(t, models.VerificationMethodEmail, email)
	token := h.resetTokenFor(t, email)

	if code := h.reset(t, token, "short"); code != http.StatusBadRequest {
		t.Fatalf("a short password got status %d, want 400", code)
	}
	// Refused, not spent: the link still works for a valid password.
	if code := h.reset(t, token, "YetarlichaUzun1!"); code != http.StatusOK {
		t.Fatalf("the link was consumed by a rejected attempt: status %d", code)
	}
}
