//go:build integration

// End-to-end authentication tests: real router, real service, real repository,
// real PostgreSQL. They need a migrated database:
//
//	TEST_DATABASE_DSN="host=localhost port=5432 user=postgres password=postgres dbname=renthouse sslmode=disable" \
//	    go test -tags=integration ./...
//
// The DSN is required, not inferred: skipping silently would report success
// while testing nothing.
//
// Each test registers users under a unique email and phone and deletes them
// afterwards, so the database is left as it was found. A transaction is not
// used here because the handlers own their own database calls.
package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
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

const integrationSecret = "integration-test-secret"

var testDSN string

func TestMain(m *testing.M) {
	testDSN = strings.TrimSpace(os.Getenv("TEST_DATABASE_DSN"))
	if testDSN == "" {
		println("integration tests require TEST_DATABASE_DSN, e.g.")
		println(`  TEST_DATABASE_DSN="host=localhost port=5432 user=postgres password=postgres dbname=renthouse sslmode=disable"`)
		os.Exit(1)
	}
	gin.SetMode(gin.TestMode)
	if err := dto.RegisterValidators(); err != nil {
		println("register validators:", err.Error())
		os.Exit(1)
	}
	os.Exit(m.Run())
}

type harness struct {
	router *gin.Engine
	db     *gorm.DB
	tokens *token.Service
}

func newHarness(t *testing.T) *harness {
	t.Helper()

	db, err := gorm.Open(postgres.Open(testDSN), &gorm.Config{
		Logger: gormlogger.Default.LogMode(gormlogger.Silent),
	})
	if err != nil {
		t.Fatalf("connect to TEST_DATABASE_DSN: %v", err)
	}

	tokens, err := token.New(integrationSecret, time.Hour)
	if err != nil {
		t.Fatalf("build token service: %v", err)
	}

	users := repository.NewUserRepository(db)
	h := NewAuthHandler(service.NewAuthService(users, tokens))

	router := gin.New()
	auth := router.Group("/api/v1/auth")
	auth.POST("/register", h.Register)
	auth.POST("/login", h.Login)
	auth.GET("/me", middleware.Auth(tokens), h.Me)

	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return &harness{router: router, db: db, tokens: tokens}
}

// cleanupUser removes an account created by a test.
func (h *harness) cleanupUser(t *testing.T, email string) {
	t.Helper()
	t.Cleanup(func() {
		h.db.Unscoped().Where("email = ?", email).Delete(&models.User{})
	})
}

func (h *harness) do(t *testing.T, method, path string, body any, header string) *httptest.ResponseRecorder {
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
	if header != "" {
		req.Header.Set("Authorization", header)
	}

	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	return rec
}

type envelope struct {
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) envelope {
	t.Helper()
	var body envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response %q: %v", rec.Body.String(), err)
	}
	return body
}

func uniqueEmail() string { return fmt.Sprintf("auth-%s@example.test", uuid.NewString()[:8]) }

// uniquePhone builds a syntactically valid Uzbek number that will not collide.
func uniquePhone() string {
	n := uuid.New().ID() % 1000000000
	return fmt.Sprintf("+998%09d", n)
}

func registerPayload(email, phone string) map[string]string {
	return map[string]string{
		"first_name": "Samandar",
		"last_name":  "Hodiev",
		"email":      email,
		"phone":      phone,
		"password":   "StrongPassword123",
		"language":   "uz",
	}
}

func (h *harness) register(t *testing.T) (email, phone string, auth dto.AuthResponse) {
	t.Helper()

	email, phone = uniqueEmail(), uniquePhone()
	h.cleanupUser(t, email)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register", registerPayload(email, phone), "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("register got status %d, want 201: %s", rec.Code, rec.Body.String())
	}

	body := decode(t, rec)
	if err := json.Unmarshal(body.Data, &auth); err != nil {
		t.Fatalf("decode auth data: %v", err)
	}
	return email, phone, auth
}

func TestRegisterSucceedsAndReturnsAToken(t *testing.T) {
	h := newHarness(t)
	email, phone, auth := h.register(t)

	if auth.AccessToken == "" {
		t.Fatal("no access token returned")
	}
	if auth.TokenType != "Bearer" {
		t.Errorf("got token type %q, want Bearer", auth.TokenType)
	}
	if auth.ExpiresIn != int64((time.Hour).Seconds()) {
		t.Errorf("got expires_in %d, want 3600", auth.ExpiresIn)
	}
	if auth.User.Email != email || auth.User.Phone != phone {
		t.Errorf("returned user does not match the request: %+v", auth.User)
	}
	if auth.User.ID == "" {
		t.Error("user id is empty")
	}
	if auth.User.Language != "uz" || auth.User.Theme != models.ThemeLight {
		t.Errorf("got language %q theme %q, want uz/light", auth.User.Language, auth.User.Theme)
	}

	// The token must actually identify the new user.
	userID, err := h.tokens.Validate(auth.AccessToken)
	if err != nil {
		t.Fatalf("returned token does not validate: %v", err)
	}
	if userID.String() != auth.User.ID {
		t.Fatalf("token subject %s does not match user %s", userID, auth.User.ID)
	}
}

func TestRegisterNeverReturnsThePasswordHash(t *testing.T) {
	h := newHarness(t)

	email, phone := uniqueEmail(), uniquePhone()
	h.cleanupUser(t, email)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register", registerPayload(email, phone), "")
	raw := rec.Body.String()

	for _, needle := range []string{"password_hash", "PasswordHash", "$2a$", "$2b$", "StrongPassword123"} {
		if strings.Contains(raw, needle) {
			t.Errorf("response contains %q: %s", needle, raw)
		}
	}
}

func TestRegisterStoresAHashedPassword(t *testing.T) {
	h := newHarness(t)
	email, _, _ := h.register(t)

	var user models.User
	if err := h.db.Where("email = ?", email).First(&user).Error; err != nil {
		t.Fatalf("load stored user: %v", err)
	}

	if user.PasswordHash == "StrongPassword123" {
		t.Fatal("the password was stored in plaintext")
	}
	if !strings.HasPrefix(user.PasswordHash, "$2a$") && !strings.HasPrefix(user.PasswordHash, "$2b$") {
		t.Fatalf("stored hash %q does not look like bcrypt", user.PasswordHash)
	}
}

func TestRegisterRejectsADuplicateEmail(t *testing.T) {
	h := newHarness(t)
	email, _, _ := h.register(t)

	// Same email, different phone.
	rec := h.do(t, http.MethodPost, "/api/v1/auth/register", registerPayload(email, uniquePhone()), "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("got status %d, want 409: %s", rec.Code, rec.Body.String())
	}
	if body := decode(t, rec); body.Success || body.Message != "User already exists" {
		t.Fatalf("got %+v, want a generic conflict message", body)
	}
}

func TestRegisterRejectsADuplicatePhone(t *testing.T) {
	h := newHarness(t)
	_, phone, _ := h.register(t)

	other := uniqueEmail()
	h.cleanupUser(t, other)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register", registerPayload(other, phone), "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("got status %d, want 409: %s", rec.Code, rec.Body.String())
	}
}

func TestRegisterNormalizesEmailCase(t *testing.T) {
	h := newHarness(t)

	email, phone := uniqueEmail(), uniquePhone()
	h.cleanupUser(t, email)

	payload := registerPayload(strings.ToUpper(email), phone)
	rec := h.do(t, http.MethodPost, "/api/v1/auth/register", payload, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("got status %d, want 201: %s", rec.Code, rec.Body.String())
	}

	var auth dto.AuthResponse
	_ = json.Unmarshal(decode(t, rec).Data, &auth)
	if auth.User.Email != email {
		t.Fatalf("got %q, want the lowercased %q", auth.User.Email, email)
	}

	// The uppercase form must not be able to register a second account.
	dup := h.do(t, http.MethodPost, "/api/v1/auth/register", registerPayload(email, uniquePhone()), "")
	if dup.Code != http.StatusConflict {
		t.Fatalf("case-different email created a second account (status %d)", dup.Code)
	}
}

func TestRegisterValidation(t *testing.T) {
	h := newHarness(t)

	cases := map[string]func(map[string]string){
		"missing first name": func(p map[string]string) { delete(p, "first_name") },
		"missing last name":  func(p map[string]string) { delete(p, "last_name") },
		"missing email":      func(p map[string]string) { delete(p, "email") },
		"invalid email":      func(p map[string]string) { p["email"] = "not-an-email" },
		"missing phone":      func(p map[string]string) { delete(p, "phone") },
		"non-uzbek phone":    func(p map[string]string) { p["phone"] = "+12025550100" },
		"phone without plus": func(p map[string]string) { p["phone"] = "998901234567" },
		"missing password":   func(p map[string]string) { delete(p, "password") },
		"short password":     func(p map[string]string) { p["password"] = "short" },
		"overlong password":  func(p map[string]string) { p["password"] = strings.Repeat("a", 73) },
		"unknown language":   func(p map[string]string) { p["language"] = "de" },
	}

	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			payload := registerPayload(uniqueEmail(), uniquePhone())
			mutate(payload)

			rec := h.do(t, http.MethodPost, "/api/v1/auth/register", payload, "")
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("got status %d, want 400: %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestRegisterIgnoresAClientSuppliedPasswordHash(t *testing.T) {
	h := newHarness(t)

	email, phone := uniqueEmail(), uniquePhone()
	h.cleanupUser(t, email)

	payload := registerPayload(email, phone)
	payload["password_hash"] = "$2a$12$attacker-controlled-hash-value-here"
	payload["id"] = uuid.NewString()

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register", payload, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("got status %d, want 201: %s", rec.Code, rec.Body.String())
	}

	var user models.User
	if err := h.db.Where("email = ?", email).First(&user).Error; err != nil {
		t.Fatalf("load stored user: %v", err)
	}
	if user.PasswordHash == payload["password_hash"] {
		t.Fatal("the client's password_hash was accepted")
	}
	if user.ID.String() == payload["id"] {
		t.Fatal("the client's id was accepted")
	}
}

func TestLoginWithEmail(t *testing.T) {
	h := newHarness(t)
	email, _, _ := h.register(t)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": email, "password": "StrongPassword123"}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200: %s", rec.Code, rec.Body.String())
	}

	body := decode(t, rec)
	if body.Message != "Login successful" {
		t.Errorf("got message %q", body.Message)
	}

	var auth dto.AuthResponse
	_ = json.Unmarshal(body.Data, &auth)
	if auth.AccessToken == "" {
		t.Fatal("no access token returned")
	}
}

func TestLoginWithPhone(t *testing.T) {
	h := newHarness(t)
	_, phone, _ := h.register(t)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": phone, "password": "StrongPassword123"}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200: %s", rec.Code, rec.Body.String())
	}
}

func TestLoginWithADifferentlyCasedEmail(t *testing.T) {
	h := newHarness(t)
	email, _, _ := h.register(t)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": strings.ToUpper(email), "password": "StrongPassword123"}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200: %s", rec.Code, rec.Body.String())
	}
}

func TestLoginWithAWrongPassword(t *testing.T) {
	h := newHarness(t)
	email, _, _ := h.register(t)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": email, "password": "WrongPassword123"}, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401: %s", rec.Code, rec.Body.String())
	}
	if body := decode(t, rec); body.Message != "Invalid credentials" {
		t.Fatalf("got message %q, want the generic one", body.Message)
	}
}

func TestLoginWithAnUnknownUser(t *testing.T) {
	h := newHarness(t)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": uniqueEmail(), "password": "StrongPassword123"}, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401: %s", rec.Code, rec.Body.String())
	}
	if body := decode(t, rec); body.Message != "Invalid credentials" {
		t.Fatalf("got message %q, want the generic one", body.Message)
	}
}

func TestLoginDoesNotRevealWhetherAnAccountExists(t *testing.T) {
	h := newHarness(t)
	email, _, _ := h.register(t)

	known := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": email, "password": "WrongPassword123"}, "")
	unknown := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": uniqueEmail(), "password": "WrongPassword123"}, "")

	if known.Code != unknown.Code {
		t.Fatalf("status differs: known %d, unknown %d", known.Code, unknown.Code)
	}
	if known.Body.String() != unknown.Body.String() {
		t.Fatalf("body differs:\n known:   %s\n unknown: %s", known.Body.String(), unknown.Body.String())
	}
}

func TestLoginValidation(t *testing.T) {
	h := newHarness(t)

	for name, payload := range map[string]map[string]string{
		"missing identifier": {"password": "StrongPassword123"},
		"missing password":   {"identifier": "a@b.test"},
		"empty body":         {},
	} {
		t.Run(name, func(t *testing.T) {
			rec := h.do(t, http.MethodPost, "/api/v1/auth/login", payload, "")
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("got status %d, want 400: %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestMeReturnsTheAuthenticatedUser(t *testing.T) {
	h := newHarness(t)
	email, phone, auth := h.register(t)

	rec := h.do(t, http.MethodGet, "/api/v1/auth/me", nil, "Bearer "+auth.AccessToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200: %s", rec.Code, rec.Body.String())
	}

	body := decode(t, rec)
	if body.Message != "Authenticated user" {
		t.Errorf("got message %q", body.Message)
	}

	var user dto.UserResponse
	if err := json.Unmarshal(body.Data, &user); err != nil {
		t.Fatalf("decode user: %v", err)
	}
	if user.ID != auth.User.ID || user.Email != email || user.Phone != phone {
		t.Fatalf("got %+v, want the registered user", user)
	}
	if raw := rec.Body.String(); strings.Contains(raw, "password") {
		t.Fatalf("response mentions a password: %s", raw)
	}
}

func TestMeRequiresTheToken(t *testing.T) {
	h := newHarness(t)

	for name, header := range map[string]string{
		"no header":     "",
		"no scheme":     "sometoken",
		"wrong scheme":  "Basic sometoken",
		"garbage token": "Bearer not-a-jwt",
		"empty token":   "Bearer ",
	} {
		t.Run(name, func(t *testing.T) {
			rec := h.do(t, http.MethodGet, "/api/v1/auth/me", nil, header)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("got status %d, want 401: %s", rec.Code, rec.Body.String())
			}
			if body := decode(t, rec); body.Success {
				t.Fatal("an unauthorized response must not report success")
			}
		})
	}
}

func TestMeRejectsAnExpiredToken(t *testing.T) {
	h := newHarness(t)
	_, _, auth := h.register(t)

	claims := jwt.RegisteredClaims{
		Subject:   auth.User.ID,
		IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
	}
	raw, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(integrationSecret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	rec := h.do(t, http.MethodGet, "/api/v1/auth/me", nil, "Bearer "+raw)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401: %s", rec.Code, rec.Body.String())
	}
}

func TestMeRejectsAForeignSignature(t *testing.T) {
	h := newHarness(t)
	_, _, auth := h.register(t)

	forged, _ := token.New("a-different-secret", time.Hour)
	userID, _ := uuid.Parse(auth.User.ID)
	raw, _, _ := forged.Generate(userID)

	rec := h.do(t, http.MethodGet, "/api/v1/auth/me", nil, "Bearer "+raw)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401: %s", rec.Code, rec.Body.String())
	}
}

func TestMeRejectsATokenForADeletedAccount(t *testing.T) {
	h := newHarness(t)
	email, _, auth := h.register(t)

	// A signed, unexpired token whose account no longer exists.
	h.db.Unscoped().Where("email = ?", email).Delete(&models.User{})

	rec := h.do(t, http.MethodGet, "/api/v1/auth/me", nil, "Bearer "+auth.AccessToken)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401: %s", rec.Code, rec.Body.String())
	}
}
