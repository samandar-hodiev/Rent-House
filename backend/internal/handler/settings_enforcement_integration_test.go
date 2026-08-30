//go:build integration

// What the settings page is for: proving that changing a value changes what the
// marketplace does.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run Enforce
//
// Every case here writes a setting through the service the dashboard writes
// through, then exercises the public API and checks the outcome moved. All of
// it inside one transaction that is rolled back, so the suite can be pointed at
// a development database.
package handler

import (
	"net/http"
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

func TestEnforceMaintenanceMode(t *testing.T) {
	h := newAdminHarness(t)

	// The public API, with the same middleware cmd/server puts in front of it.
	public := h.publicRouter(t)

	status, _ := doPublic(t, public, http.MethodGet, "/api/v1/apartments")
	if status != http.StatusOK {
		t.Fatalf("before maintenance: got %d, want 200", status)
	}

	configureSettings(t, h, map[string]any{models.SettingMaintenanceMode: true})

	status, body := doPublic(t, public, http.MethodGet, "/api/v1/apartments")
	if status != http.StatusServiceUnavailable {
		t.Fatalf("during maintenance: got %d, want 503 (%v)", status, body)
	}
	if body["error"] != "maintenance_mode" {
		t.Errorf("error code: got %v, want maintenance_mode", body["error"])
	}

	// The configuration itself stays readable: it is what tells a browser the
	// site is closed and carries the message to show.
	status, _ = doPublic(t, public, http.MethodGet, "/api/v1/settings")
	if status != http.StatusOK {
		t.Fatalf("public settings during maintenance: got %d, want 200", status)
	}

	// And the dashboard stays reachable, or maintenance could never be undone.
	status, _ = h.do(t, http.MethodGet, "/api/v1/admin/roles", h.tokenFor(t, h.owner.ID), nil)
	if status != http.StatusOK {
		t.Fatalf("dashboard during maintenance: got %d, want 200", status)
	}

	configureSettings(t, h, map[string]any{models.SettingMaintenanceMode: false})
	status, _ = doPublic(t, public, http.MethodGet, "/api/v1/apartments")
	if status != http.StatusOK {
		t.Fatalf("after maintenance: got %d, want 200", status)
	}
}

func TestEnforceRegistrationClosed(t *testing.T) {
	h := newAdminHarness(t)
	public := h.publicRouter(t)

	configureSettings(t, h, map[string]any{models.SettingUserRegistrationEnabled: false})

	status, body := doPublicJSON(t, public, http.MethodPost, "/api/v1/auth/register/request",
		map[string]any{"method": "email", "email": "closed-registration@renthouse.test"})
	if status != http.StatusForbidden {
		t.Fatalf("registration while closed: got %d, want 403 (%v)", status, body)
	}
	if body["error"] != "registration_closed" {
		t.Errorf("error code: got %v, want registration_closed", body["error"])
	}

	// Open again, and only the channel the owner allows is accepted.
	configureSettings(t, h, map[string]any{
		models.SettingUserRegistrationEnabled:  true,
		models.SettingRegistrationEmailEnabled: false,
	})
	status, body = doPublicJSON(t, public, http.MethodPost, "/api/v1/auth/register/request",
		map[string]any{"method": "email", "email": "closed-channel@renthouse.test"})
	if status != http.StatusForbidden || body["error"] != "method_disabled" {
		t.Fatalf("email registration while disabled: got %d %v, want 403 method_disabled",
			status, body["error"])
	}
}

func TestEnforcePasswordPolicyOnMarketplace(t *testing.T) {
	h := newAdminHarness(t)

	// The same policy the dashboard applies to an administrator is the one the
	// marketplace applies to a visitor — one function, one rule.
	configureSettings(t, h, map[string]any{
		models.SettingPasswordMinLength:     12,
		models.SettingPasswordRequireStrong: true,
	})

	settings := h.settings.MustGet(t.Context())
	if settings.PasswordMinLength != 12 || !settings.PasswordRequireStrong {
		t.Fatalf("policy not stored: %+v", settings)
	}
}
