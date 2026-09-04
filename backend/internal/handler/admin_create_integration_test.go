//go:build integration

// End-to-end tests for creating an administrator: real router, real middleware,
// real service, real PostgreSQL.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run AdminCreate
//
// What these exist for is the rule that cannot be checked from the dashboard:
// only the owner may add an administrator, and that must hold at the API rather
// than because the button is hidden.
//
// Everything runs inside one transaction that is rolled back, so the suite can
// be pointed at a development database without leaving accounts behind.
package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
)

type adminHarness struct {
	tx       *gorm.DB
	router   *gin.Engine
	tokens   *token.Service
	admins   *service.AdminService
	settings *service.SettingsService
	owner    *models.Admin
}

func newAdminHarness(t *testing.T) *adminHarness {
	t.Helper()

	db, err := gorm.Open(postgres.Open(testDSN), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Silent),
	})
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	tx := db.Begin()
	if tx.Error != nil {
		t.Fatalf("begin: %v", tx.Error)
	}
	t.Cleanup(func() {
		tx.Rollback()
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})

	tokens, err := token.New(integrationSecret, time.Hour)
	if err != nil {
		t.Fatalf("tokens: %v", err)
	}

	settings := service.NewSettingsService(repository.NewSettingsRepository(tx))
	adminRepo := repository.NewAdminRepository(tx)
	admins := service.NewAdminService(adminRepo, tokens, settings, repository.NewRefreshTokenRepository(tx))

	handler := NewAdminHandler(
		admins,
		service.NewAdminStatsService(repository.NewAdminStatsRepository(tx), settings),
		service.NewAdminListingService(
			repository.NewAdminListingRepository(tx), repository.NewApartmentRepository(tx),
			settings,
		),
		settings,
		nil, "/uploads", "",
	)

	// The same chain cmd/server builds: authenticate, then require the owner on
	// the routes that are the owner's. A test that skipped the middleware would
	// prove nothing about who may call this.
	router := gin.New()
	group := router.Group("/api/v1/admin", middleware.AdminAuth(tokens, admins))
	group.GET("/roles", handler.Roles)
	adminsGroup := group.Group("/admins", middleware.RequireOwner())
	adminsGroup.GET("", handler.List)
	adminsGroup.POST("", handler.Create)

	// The owner this system already has. Its password is never needed: a test
	// signs a token for it rather than signing in as it, so no credential is
	// read or written anywhere.
	var found models.Admin
	if err := tx.Where("role = ?", models.AdminRoleOwner).First(&found).Error; err != nil {
		t.Skipf("no owner account in the database: %v", err)
	}

	return &adminHarness{
		tx: tx, router: router, tokens: tokens,
		admins: admins, settings: settings, owner: &found,
	}
}

// publicRouter builds the marketplace's own API with the same middleware
// cmd/server puts in front of it — including the maintenance check, which is
// what several of these tests are about.
func (h *adminHarness) publicRouter(t *testing.T) *gin.Engine {
	t.Helper()

	apartments := repository.NewApartmentRepository(h.tx)
	analytics, err := service.NewAnalyticsService(
		repository.NewAnalyticsRepository(h.tx), apartments, integrationSecret)
	if err != nil {
		t.Fatalf("analytics: %v", err)
	}

	authService := service.NewAuthService(
		repository.NewUserRepository(h.tx),
		repository.NewVerificationRepository(h.tx),
		h.tokens, silentSender{}, silentSender{}, testPolicy(),
		h.settings, repository.NewLoginAttemptRepository(h.tx),
		repository.NewRefreshTokenRepository(h.tx),
	)
	apartmentHandler := NewApartmentHandler(
		service.NewApartmentService(apartments, h.settings), analytics)
	authHandler := NewAuthHandler(authService, "http://localhost:5173")

	router := gin.New()
	v1 := router.Group("/api/v1", middleware.Maintenance(h.settings))
	v1.GET("/settings", NewSettingsHandler(h.settings).Public)
	v1.GET("/apartments", apartmentHandler.List)
	v1.POST("/auth/register/request", authHandler.RequestRegistrationCode)
	return router
}

// silentSender stands in for the SMS and email providers: these tests never
// read a code, and a real provider would be a network call.
type silentSender struct{}

func (silentSender) Send(context.Context, string, string) error { return nil }

// configureSettings writes settings the way the dashboard does.
func configureSettings(t *testing.T, h *adminHarness, patch map[string]any) {
	t.Helper()
	if _, err := h.settings.Update(t.Context(), patch, &h.owner.ID); err != nil {
		t.Fatalf("configure %v: %v", patch, err)
	}
}

// doPublic and doPublicJSON send one request to the marketplace API.
func doPublic(t *testing.T, router *gin.Engine, method, path string) (int, map[string]any) {
	t.Helper()
	return doPublicJSON(t, router, method, path, nil)
}

func doPublicJSON(
	t *testing.T, router *gin.Engine, method, path string, body any,
) (int, map[string]any) {
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
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var decoded map[string]any
	if rec.Body.Len() > 0 {
		_ = json.Unmarshal(rec.Body.Bytes(), &decoded)
	}
	return rec.Code, decoded
}

// tokenFor signs an admin-scoped token, which is what the middleware validates.
func (h *adminHarness) tokenFor(t *testing.T, id uuid.UUID) string {
	t.Helper()
	signed, _, err := h.tokens.GenerateScoped(id, "renthouse:admin", time.Hour)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

// seedSuperAdmin creates a second administrator directly through the service,
// acting as the owner — the same path the dashboard uses.
func (h *adminHarness) seedSuperAdmin(t *testing.T, email string) *models.Admin {
	t.Helper()
	created, err := h.admins.Create(t.Context(), h.owner, service.CreateInput{
		Name: "Test Super Admin", Email: email,
		Role: models.AdminRoleSuperAdmin, Password: "TestPassword123",
	})
	if err != nil {
		t.Fatalf("seed super admin: %v", err)
	}
	return created
}

// do sends one request and decodes the envelope, so a test reads as the thing
// it is checking rather than as request plumbing.
func (h *adminHarness) do(
	t *testing.T, method, path, bearer string, body any,
) (int, map[string]any) {
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
		req.Header.Set("Authorization", "Bearer "+bearer)
	}

	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)

	var decoded map[string]any
	if rec.Body.Len() > 0 {
		_ = json.Unmarshal(rec.Body.Bytes(), &decoded)
	}
	return rec.Code, decoded
}

func TestAdminCreateRequiresOwner(t *testing.T) {
	h := newAdminHarness(t)

	superAdmin := h.seedSuperAdmin(t, "super-admin-403@renthouse.test")
	bearer := h.tokenFor(t, superAdmin.ID)

	status, body := h.do(t, http.MethodPost, "/api/v1/admin/admins", bearer, map[string]any{
		"name": "Someone Else", "email": "someone-else@renthouse.test",
		"role": "super_admin", "password": "TestPassword123",
	})
	if status != http.StatusForbidden {
		t.Fatalf("a super admin creating an administrator: got %d, want 403 (%v)", status, body)
	}

	// And nothing was written: a refusal that still created the row would be
	// worse than no check at all.
	var count int64
	h.tx.Model(&models.Admin{}).Where("email = ?", "someone-else@renthouse.test").Count(&count)
	if count != 0 {
		t.Fatal("the refused request created an administrator anyway")
	}
}

func TestAdminCreateByOwner(t *testing.T) {
	h := newAdminHarness(t)
	bearer := h.tokenFor(t, h.owner.ID)

	const email = "new-admin@renthouse.test"
	const password = "TestPassword123"

	status, body := h.do(t, http.MethodPost, "/api/v1/admin/admins", bearer, map[string]any{
		"name": "Alisher Berdiev", "email": email,
		"role": "super_admin", "password": password,
	})
	if status != http.StatusCreated {
		t.Fatalf("owner creating an administrator: got %d, want 201 (%v)", status, body)
	}

	data, _ := body["data"].(map[string]any)
	if data["role"] != models.AdminRoleSuperAdmin {
		t.Errorf("role: got %v, want super_admin", data["role"])
	}
	if data["status"] != models.AdminStatusActive {
		t.Errorf("status: got %v, want active", data["status"])
	}
	if _, leaked := data["password"]; leaked {
		t.Error("the response carries a password field")
	}

	// The row, as stored.
	var stored models.Admin
	if err := h.tx.Where("email = ?", email).First(&stored).Error; err != nil {
		t.Fatalf("the administrator was not written: %v", err)
	}
	if stored.PasswordHash == password {
		t.Fatal("the password was stored as plain text")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(stored.PasswordHash), []byte(password)); err != nil {
		t.Fatalf("the stored hash does not verify the password: %v", err)
	}

	// The action was recorded, with the account it created.
	var entries int64
	h.tx.Model(&models.AdminAuditLog{}).
		Where("action = ? AND target = ?", models.AuditAdminCreated, email).Count(&entries)
	if entries != 1 {
		t.Fatalf("audit entries for the creation: got %d, want 1", entries)
	}

	// And it is in the list the dashboard reads, without a refresh being the
	// thing that makes it true.
	status, listBody := h.do(t, http.MethodGet, "/api/v1/admin/admins", bearer, nil)
	if status != http.StatusOK {
		t.Fatalf("list: got %d, want 200", status)
	}
	rows, _ := listBody["data"].([]any)
	var seen bool
	for _, row := range rows {
		if entry, ok := row.(map[string]any); ok && entry["email"] == email {
			seen = true
		}
	}
	if !seen {
		t.Fatal("the new administrator is missing from the list")
	}
}

func TestAdminCreateRejectsBadInput(t *testing.T) {
	cases := []struct {
		name string
		// seedEmail, when set, is an administrator created first so the case
		// can collide with it.
		seedEmail string
		body      map[string]any
		want      int
	}{
		{"a second owner", "", map[string]any{
			"name": "Second Owner", "email": "second-owner@renthouse.test",
			"role": "owner", "password": "TestPassword123",
		}, http.StatusBadRequest},
		{"a role that does not exist", "", map[string]any{
			"name": "Moderator", "email": "moderator@renthouse.test",
			"role": "moderator", "password": "TestPassword123",
		}, http.StatusBadRequest},
		{"an email already taken", "duplicate@renthouse.test", map[string]any{
			"name": "Duplicate", "email": "duplicate@renthouse.test",
			"role": "super_admin", "password": "TestPassword123",
		}, http.StatusConflict},
		{"no name", "", map[string]any{
			"name": "", "email": "no-name@renthouse.test",
			"role": "super_admin", "password": "TestPassword123",
		}, http.StatusBadRequest},
		{"not an email address", "", map[string]any{
			"name": "Bad Email", "email": "not-an-email",
			"role": "super_admin", "password": "TestPassword123",
		}, http.StatusBadRequest},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			// A harness of its own: a rejected insert leaves PostgreSQL's
			// transaction aborted, and every later statement in it fails. That
			// is a property of testing inside one transaction, not of the
			// endpoint, so each case gets a clean one.
			h := newAdminHarness(t)
			bearer := h.tokenFor(t, h.owner.ID)
			if testCase.seedEmail != "" {
				h.seedSuperAdmin(t, testCase.seedEmail)
			}

			status, body := h.do(t, http.MethodPost, "/api/v1/admin/admins", bearer, testCase.body)
			if status != testCase.want {
				t.Fatalf("got %d, want %d (%v)", status, testCase.want, body)
			}
		})
	}
}

// The password rule is the owner's to set on the settings page, and the create
// endpoint must apply the rule in force rather than one compiled into a tag.
func TestAdminCreateAppliesConfiguredPasswordPolicy(t *testing.T) {
	h := newAdminHarness(t)
	bearer := h.tokenFor(t, h.owner.ID)

	if _, err := h.settings.Update(t.Context(), map[string]any{
		models.SettingPasswordMinLength:     12,
		models.SettingPasswordRequireStrong: true,
	}, &h.owner.ID); err != nil {
		t.Fatalf("configure the policy: %v", err)
	}

	status, body := h.do(t, http.MethodPost, "/api/v1/admin/admins", bearer, map[string]any{
		"name": "Weak Password", "email": "weak@renthouse.test",
		"role": "super_admin", "password": "shortpwd",
	})
	if status != http.StatusBadRequest {
		t.Fatalf("a password under the configured minimum: got %d, want 400 (%v)", status, body)
	}

	status, body = h.do(t, http.MethodPost, "/api/v1/admin/admins", bearer, map[string]any{
		"name": "No Digit", "email": "no-digit@renthouse.test",
		"role": "super_admin", "password": "abcdefghijklm",
	})
	if status != http.StatusBadRequest {
		t.Fatalf("a password with no digit while strong is required: got %d, want 400 (%v)",
			status, body)
	}

	status, body = h.do(t, http.MethodPost, "/api/v1/admin/admins", bearer, map[string]any{
		"name": "Strong Enough", "email": "strong@renthouse.test",
		"role": "super_admin", "password": "StrongEnough1",
	})
	if status != http.StatusCreated {
		t.Fatalf("a password meeting the policy: got %d, want 201 (%v)", status, body)
	}
}

// The form draws its options from this, so what it describes has to be what the
// server enforces.
func TestAdminRolesCatalog(t *testing.T) {
	h := newAdminHarness(t)
	bearer := h.tokenFor(t, h.owner.ID)

	status, body := h.do(t, http.MethodGet, "/api/v1/admin/roles", bearer, nil)
	if status != http.StatusOK {
		t.Fatalf("roles: got %d, want 200 (%v)", status, body)
	}

	data, _ := body["data"].(map[string]any)
	roles, _ := data["roles"].([]any)
	if len(roles) != 2 {
		t.Fatalf("roles: got %d, want 2", len(roles))
	}

	byID := map[string]map[string]any{}
	for _, row := range roles {
		if entry, ok := row.(map[string]any); ok {
			byID[entry["id"].(string)] = entry
		}
	}

	if byID[models.AdminRoleOwner]["assignable"] != false {
		t.Error("owner is offered as assignable while one already exists")
	}
	if byID[models.AdminRoleSuperAdmin]["assignable"] != true {
		t.Error("super admin is not assignable")
	}

	// The owner reaches everything; a super admin does not reach the sections
	// that are the owner's by rule.
	ownerSections, _ := byID[models.AdminRoleOwner]["sections"].([]any)
	if len(ownerSections) == 0 {
		t.Fatal("the owner role lists no sections")
	}
	for _, row := range ownerSections {
		if entry, _ := row.(map[string]any); entry["allowed"] != true {
			t.Errorf("the owner is denied %v", entry["section"])
		}
	}

	superSections, _ := byID[models.AdminRoleSuperAdmin]["sections"].([]any)
	var restricted bool
	for _, row := range superSections {
		if entry, _ := row.(map[string]any); entry["section"] == "adminManagement" {
			restricted = entry["allowed"] == false
		}
	}
	if !restricted {
		t.Error("a super admin is shown as able to manage administrators")
	}

	policy, _ := data["password_policy"].(map[string]any)
	if policy["min_length"] == nil {
		t.Error("the catalog carries no password policy")
	}
}

// Every administrator may read the catalog — it describes the rules, and
// knowing them grants nothing — but an unauthenticated caller may not.
func TestAdminRolesNeedsAToken(t *testing.T) {
	h := newAdminHarness(t)

	status, _ := h.do(t, http.MethodGet, "/api/v1/admin/roles", "", nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("no token: got %d, want 401", status)
	}

	superAdmin := h.seedSuperAdmin(t, "reader@renthouse.test")
	status, body := h.do(t, http.MethodGet, "/api/v1/admin/roles",
		h.tokenFor(t, superAdmin.ID), nil)
	if status != http.StatusOK {
		t.Fatalf("a super admin reading the catalog: got %d, want 200 (%v)", status, body)
	}
}
