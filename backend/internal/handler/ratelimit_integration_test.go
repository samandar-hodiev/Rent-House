//go:build integration

// IP-based rate limiting, wired the same way as cmd/server/main.go, against a
// real AuthHandler and PostgreSQL.
//
// This does not reuse the shared harness's router: that router is shared by
// dozens of tests which, between them, already sit close to the production
// limits (a table of five bad-payload cases against a register-request limit
// of five, for instance). Wiring the production limits into it would make
// those tests fail not because of a rule they are checking, but because of an
// unrelated one sharing their address. A dedicated router with its own small
// limit keeps the two concerns apart.
package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
)

func rateLimitedRegisterRouter(t *testing.T, limit int, window time.Duration) *gin.Engine {
	t.Helper()
	h := newHarness(t)
	handler := NewAuthHandler(h.auth, "http://localhost:5173")

	router := gin.New()
	router.POST("/api/v1/auth/register/request",
		middleware.RateLimit(limit, window),
		handler.RequestRegistrationCode)
	return router
}

func postRegisterRequest(router *gin.Engine, remoteAddr, phone string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]string{"method": "phone", "phone": phone})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register/request", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = remoteAddr

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestRateLimitBlocksAnIPOnceItsAllowanceIsUsedUp(t *testing.T) {
	const limit = 2
	router := rateLimitedRegisterRouter(t, limit, time.Minute)
	const caller = "203.0.113.10:5555"

	for i := 1; i <= limit; i++ {
		rec := postRegisterRequest(router, caller, uniquePhone())
		if rec.Code != http.StatusOK {
			t.Fatalf("request %d: got status %d within the allowance, want 200: %s",
				i, rec.Code, rec.Body.String())
		}
	}

	blocked := postRegisterRequest(router, caller, uniquePhone())
	if blocked.Code != http.StatusTooManyRequests {
		t.Fatalf("got status %d, want 429 once the allowance is used up: %s",
			blocked.Code, blocked.Body.String())
	}
	if blocked.Header().Get("Retry-After") == "" {
		t.Fatal("expected a Retry-After header on the throttled response")
	}
}

func TestRateLimitDoesNotConfuseTwoCallers(t *testing.T) {
	const limit = 1
	router := rateLimitedRegisterRouter(t, limit, time.Minute)

	first := postRegisterRequest(router, "203.0.113.10:5555", uniquePhone())
	if first.Code != http.StatusOK {
		t.Fatalf("first caller: got status %d, want 200: %s", first.Code, first.Body.String())
	}

	// A different address has used none of its own allowance yet.
	second := postRegisterRequest(router, "198.51.100.20:5555", uniquePhone())
	if second.Code != http.StatusOK {
		t.Fatalf("second caller: got status %d, want 200: %s", second.Code, second.Body.String())
	}

	// The first address, meanwhile, is now over its own limit.
	repeat := postRegisterRequest(router, "203.0.113.10:5555", uniquePhone())
	if repeat.Code != http.StatusTooManyRequests {
		t.Fatalf("got status %d, want 429 for the address repeating past its limit: %s",
			repeat.Code, repeat.Body.String())
	}
}
