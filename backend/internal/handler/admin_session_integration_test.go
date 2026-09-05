//go:build integration

// Dashboard sessions: signing in, renewing one, ending one, and what happens
// to one that should not work any more. The admin-side counterpart to
// session_integration_test.go — until now a dashboard sign-in minted one
// stateless JWT and nothing else, so "sign out" meant the browser forgetting a
// token and a leaked one was good for its whole (8-hour) lifetime.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run AdminSession
package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
)

const adminSessionPassword = "StrongPassword123"

// adminSessionHarness is its own harness rather than a reuse of adminHarness
// (see admin_create_integration_test.go): that one signs test requests with a
// token minted directly, on purpose, so it never has to know a real
// administrator's password. Exercising Login itself needs one.
type adminSessionHarness struct {
	tx     *gorm.DB
	router *gin.Engine
	admin  *models.Admin
}

func newAdminSessionHarness(t *testing.T) *adminSessionHarness {
	t.Helper()

	db, err := gorm.Open(postgres.Open(testDSN), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Silent),
	})
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	transaction := db.Begin()
	if transaction.Error != nil {
		t.Fatalf("begin: %v", transaction.Error)
	}
	t.Cleanup(func() {
		transaction.Rollback()
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})

	tokens, err := token.New(integrationSecret, time.Hour)
	if err != nil {
		t.Fatalf("tokens: %v", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(adminSessionPassword), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	admin := &models.Admin{
		Name:         "Session Test Admin",
		Email:        uniqueEmail(),
		PasswordHash: string(hash),
		Role:         models.AdminRoleSuperAdmin,
		Status:       models.AdminStatusActive,
	}
	if err := transaction.Create(admin).Error; err != nil {
		t.Fatalf("create admin: %v", err)
	}

	settings := service.NewSettingsService(repository.NewSettingsRepository(transaction))
	adminService := service.NewAdminService(
		repository.NewAdminRepository(transaction), tokens, settings,
		repository.NewRefreshTokenRepository(transaction), repository.NewAdminRefreshTokenRepository(transaction),
	)
	notifications := service.NewNotificationService(repository.NewNotificationRepository(transaction), settings)
	adminHandler := NewAdminHandler(
		adminService,
		service.NewAdminStatsService(repository.NewAdminStatsRepository(transaction), settings),
		service.NewAdminListingService(
			repository.NewAdminListingRepository(transaction), repository.NewApartmentRepository(transaction),
			settings, notifications,
		),
		settings, nil, "/uploads", "",
	)

	// Mirrors cmd/server's grouping exactly: login, refresh and logout are
	// public (a refresh token in the body is the only credential any of them
	// needs), and only /auth/me sits behind AdminAuth.
	router := gin.New()
	dashboard := router.Group("/api/v1/admin")
	dashboard.POST("/auth/login", adminHandler.Login)
	dashboard.POST("/auth/refresh", adminHandler.Refresh)
	dashboard.POST("/auth/logout", adminHandler.Logout)
	authed := dashboard.Group("", middleware.AdminAuth(tokens, adminService))
	authed.GET("/auth/me", adminHandler.Me)

	return &adminSessionHarness{tx: transaction, router: router, admin: admin}
}

func (h *adminSessionHarness) do(t *testing.T, method, path string, body any, bearer string) *httptest.ResponseRecorder {
	t.Helper()

	var reader *bytes.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("encode body: %v", err)
		}
		reader = bytes.NewReader(encoded)
	} else {
		reader = bytes.NewReader(nil)
	}

	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", bearer)
	}

	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	return rec
}

// signIn calls the real login endpoint with the real password, which is the
// point: this is the one test file that cannot sign a token directly and skip
// the password check.
func (h *adminSessionHarness) signIn(t *testing.T) dto.AdminSessionResponse {
	t.Helper()
	rec := h.do(t, http.MethodPost, "/api/v1/admin/auth/login",
		map[string]string{"email": h.admin.Email, "password": adminSessionPassword}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("login: got %d, want 200 (%s)", rec.Code, rec.Body.String())
	}
	var session dto.AdminSessionResponse
	if err := json.Unmarshal(decode(t, rec).Data, &session); err != nil {
		t.Fatalf("decode session: %v", err)
	}
	if session.RefreshToken == "" {
		t.Fatal("login returned no refresh token")
	}
	return session
}

func TestAdminSessionRenews(t *testing.T) {
	h := newAdminSessionHarness(t)
	session := h.signIn(t)

	rec := h.do(t, http.MethodPost, "/api/v1/admin/auth/refresh",
		map[string]any{"refresh_token": session.RefreshToken}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("refresh: got %d, want 200 (%s)", rec.Code, rec.Body.String())
	}

	var renewed dto.AdminSessionResponse
	if err := json.Unmarshal(decode(t, rec).Data, &renewed); err != nil {
		t.Fatalf("decode renewal: %v", err)
	}
	if renewed.AccessToken == "" {
		t.Error("renewal returned no access token")
	}
	if renewed.RefreshToken == "" || renewed.RefreshToken == session.RefreshToken {
		t.Error("the refresh token was not rotated")
	}

	me := h.do(t, http.MethodGet, "/api/v1/admin/auth/me", nil, "Bearer "+renewed.AccessToken)
	if me.Code != http.StatusOK {
		t.Fatalf("the renewed access token was refused: %d", me.Code)
	}
}

func TestAdminSessionRefreshTokenIsSingleUse(t *testing.T) {
	h := newAdminSessionHarness(t)
	session := h.signIn(t)

	first := h.do(t, http.MethodPost, "/api/v1/admin/auth/refresh",
		map[string]any{"refresh_token": session.RefreshToken}, "")
	if first.Code != http.StatusOK {
		t.Fatalf("first refresh: got %d, want 200", first.Code)
	}
	var renewed dto.AdminSessionResponse
	if err := json.Unmarshal(decode(t, first).Data, &renewed); err != nil {
		t.Fatalf("decode renewal: %v", err)
	}

	// The same token again is a replay.
	second := h.do(t, http.MethodPost, "/api/v1/admin/auth/refresh",
		map[string]any{"refresh_token": session.RefreshToken}, "")
	if second.Code != http.StatusUnauthorized {
		t.Fatalf("replayed refresh: got %d, want 401", second.Code)
	}

	// And a replay ends every session this admin has, including the one the
	// replay was racing.
	third := h.do(t, http.MethodPost, "/api/v1/admin/auth/refresh",
		map[string]any{"refresh_token": renewed.RefreshToken}, "")
	if third.Code != http.StatusUnauthorized {
		t.Fatalf("after a replay the successor still worked: got %d, want 401", third.Code)
	}
}

func TestAdminSessionLogoutEndsIt(t *testing.T) {
	h := newAdminSessionHarness(t)
	session := h.signIn(t)

	// Deliberately with no Authorization header: an access token that has
	// already expired must not be required to sign out of the session behind it.
	out := h.do(t, http.MethodPost, "/api/v1/admin/auth/logout",
		map[string]any{"refresh_token": session.RefreshToken}, "")
	if out.Code != http.StatusOK {
		t.Fatalf("logout: got %d, want 200 (%s)", out.Code, out.Body.String())
	}

	again := h.do(t, http.MethodPost, "/api/v1/admin/auth/refresh",
		map[string]any{"refresh_token": session.RefreshToken}, "")
	if again.Code != http.StatusUnauthorized {
		t.Fatalf("a signed-out session renewed: got %d, want 401", again.Code)
	}

	// Signing out twice is not a failure.
	repeat := h.do(t, http.MethodPost, "/api/v1/admin/auth/logout",
		map[string]any{"refresh_token": session.RefreshToken}, "")
	if repeat.Code != http.StatusOK {
		t.Fatalf("second logout: got %d, want 200", repeat.Code)
	}
}

func TestAdminSessionRejectsNonsense(t *testing.T) {
	h := newAdminSessionHarness(t)

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
			rec := h.do(t, http.MethodPost, "/api/v1/admin/auth/refresh", testCase.body, "")
			if rec.Code != testCase.want {
				t.Fatalf("got %d, want %d (%s)", rec.Code, testCase.want, rec.Body.String())
			}
		})
	}
}

func TestAdminSessionExpires(t *testing.T) {
	h := newAdminSessionHarness(t)
	session := h.signIn(t)

	sessions := repository.NewAdminRefreshTokenRepository(h.tx)
	stored, err := sessions.FindByHash(t.Context(), sha256Hex(session.RefreshToken))
	if err != nil {
		t.Fatalf("find session: %v", err)
	}
	h.tx.Model(&models.AdminRefreshToken{}).Where("id = ?", stored.ID).
		Update("expires_at", time.Now().UTC().Add(-time.Hour))

	rec := h.do(t, http.MethodPost, "/api/v1/admin/auth/refresh",
		map[string]any{"refresh_token": session.RefreshToken}, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("an expired session renewed: got %d, want 401", rec.Code)
	}
}

// Unique to the dashboard: suspending an administrator ends their open
// sessions too, not only their next sign-in — see AdminService.SetStatus.
func TestAdminSessionEndsWhenSuspended(t *testing.T) {
	h := newAdminSessionHarness(t)
	session := h.signIn(t)

	// SetStatus is what is under test here, not the raw SQL it issues: it is
	// what is supposed to revoke the session as a side effect of suspending.
	adminService := service.NewAdminService(
		repository.NewAdminRepository(h.tx), nil, nil, nil,
		repository.NewAdminRefreshTokenRepository(h.tx),
	)
	owner := &models.Admin{Role: models.AdminRoleOwner}
	if err := adminService.SetStatus(
		t.Context(), owner, h.admin.ID, models.AdminStatusSuspended,
	); err != nil {
		t.Fatalf("suspend: %v", err)
	}

	// The token is already revoked by the time Refresh runs, so this reads as
	// an ended session (401) rather than a suspended account (403) — the
	// status check inside Refresh is what would answer 403 if a suspension
	// ever bypassed SetStatus and left a session live. Either way the session
	// does not renew, which is the property under test.
	rec := h.do(t, http.MethodPost, "/api/v1/admin/auth/refresh",
		map[string]any{"refresh_token": session.RefreshToken}, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("a suspended admin's session renewed: got %d, want 401 (%s)", rec.Code, rec.Body.String())
	}
}
