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
// The verification code never leaves the server in a response, so the tests
// capture it through a test Sender — the same interface the production provider
// will implement. Each test uses a unique contact and cleans up after itself.
package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/samandar-hodiev/Rent-House/backend/internal/config"
	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
)

const (
	integrationSecret = "integration-test-secret"
	testPassword      = "StrongPassword123"
)

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

// codeCatcher stands in for an SMS or email provider and remembers what was
// sent, which is the only way a test can learn the code.
type codeCatcher struct {
	mu   sync.Mutex
	last map[string]string
}

func newCodeCatcher() *codeCatcher { return &codeCatcher{last: map[string]string{}} }

func (c *codeCatcher) Send(_ context.Context, destination, code string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.last[destination] = code
	return nil
}

func (c *codeCatcher) codeFor(t *testing.T, destination string) string {
	t.Helper()
	c.mu.Lock()
	defer c.mu.Unlock()
	code, ok := c.last[destination]
	if !ok {
		t.Fatalf("no verification code was sent to %s", destination)
	}
	return code
}

type harness struct {
	router *gin.Engine
	db     *gorm.DB
	tokens *token.Service
	codes  *codeCatcher
	auth   *service.AuthService
	policy config.OTP
}

func testPolicy() config.OTP {
	return config.OTP{
		Expiry:                  5 * time.Minute,
		ResendCooldown:          60 * time.Second,
		MaxAttempts:             5,
		RegistrationTokenExpiry: 15 * time.Minute,
	}
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

	codes := newCodeCatcher()
	policy := testPolicy()
	authService := service.NewAuthService(
		repository.NewUserRepository(db),
		repository.NewVerificationRepository(db),
		tokens, codes, codes, policy,
	)
	h := NewAuthHandler(authService)

	router := gin.New()
	auth := router.Group("/api/v1/auth")
	auth.POST("/register/request", h.RequestRegistrationCode)
	auth.POST("/register/verify", h.VerifyRegistrationCode)
	auth.POST("/register/complete", h.CompleteRegistration)
	auth.POST("/login", h.Login)
	auth.GET("/me", middleware.Auth(tokens), h.Me)

	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return &harness{router: router, db: db, tokens: tokens, codes: codes, auth: authService, policy: policy}
}

// cleanupContact removes the account and verification rows a test created.
func (h *harness) cleanupContact(t *testing.T, method, contact string) {
	t.Helper()
	column := "phone"
	if method == models.VerificationMethodEmail {
		column = "email"
	}
	t.Cleanup(func() {
		h.db.Unscoped().Where(column+" = ?", contact).Delete(&models.AuthVerification{})
		h.db.Unscoped().Where(column+" = ?", contact).Delete(&models.User{})
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
	Error   string          `json:"error"`
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

func uniqueEmail() string { return fmt.Sprintf("otp-%s@example.test", uuid.NewString()[:8]) }

func uniquePhone() string {
	n := uuid.New().ID() % 1000000000
	return fmt.Sprintf("+998%09d", n)
}

// requestCode runs step one and returns the verification id and the code.
func (h *harness) requestCode(t *testing.T, method, contact string) (verificationID, code string) {
	t.Helper()
	h.cleanupContact(t, method, contact)

	payload := map[string]string{"method": method}
	payload[method] = contact

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/request", payload, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("request got status %d, want 200: %s", rec.Code, rec.Body.String())
	}

	var out dto.RegisterRequestOTPResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode request response: %v", err)
	}
	if out.VerificationID == "" {
		t.Fatal("no verification id returned")
	}
	return out.VerificationID, h.codes.codeFor(t, contact)
}

// verifyCode runs step two and returns the registration token.
func (h *harness) verifyCode(t *testing.T, verificationID, code string) string {
	t.Helper()

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/verify",
		map[string]string{"verification_id": verificationID, "code": code}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("verify got status %d, want 200: %s", rec.Code, rec.Body.String())
	}

	var out dto.VerifyOTPResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode verify response: %v", err)
	}
	return out.RegistrationToken
}

// completeRegistration runs step three.
func (h *harness) completeRegistration(t *testing.T, registrationToken string) dto.AuthResponse {
	t.Helper()

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/complete", map[string]string{
		"registration_token":    registrationToken,
		"first_name":            "Samandar",
		"last_name":             "Hodiev",
		"password":              testPassword,
		"password_confirmation": testPassword,
	}, "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("complete got status %d, want 201: %s", rec.Code, rec.Body.String())
	}

	var out dto.AuthResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode complete response: %v", err)
	}
	return out
}

// registerFully walks all three steps.
func (h *harness) registerFully(t *testing.T, method, contact string) dto.AuthResponse {
	t.Helper()
	id, code := h.requestCode(t, method, contact)
	regToken := h.verifyCode(t, id, code)
	return h.completeRegistration(t, regToken)
}

// ---------- step 1: request ----------

func TestRequestCodeWithPhone(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()

	id, code := h.requestCode(t, models.VerificationMethodPhone, phone)
	if id == "" || code == "" {
		t.Fatal("expected a verification id and a delivered code")
	}
	if len(code) != 6 {
		t.Fatalf("code %q is not six digits", code)
	}
}

func TestRequestCodeWithEmail(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()

	id, code := h.requestCode(t, models.VerificationMethodEmail, email)
	if id == "" || code == "" {
		t.Fatal("expected a verification id and a delivered code")
	}
}

func TestRequestCodeNeverReturnsTheCode(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	h.cleanupContact(t, models.VerificationMethodPhone, phone)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/request",
		map[string]string{"method": "phone", "phone": phone}, "")

	code := h.codes.codeFor(t, phone)
	if strings.Contains(rec.Body.String(), code) {
		t.Fatalf("the response leaked the code: %s", rec.Body.String())
	}
}

func TestRequestCodeStoresOnlyAHash(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	id, code := h.requestCode(t, models.VerificationMethodPhone, phone)

	var v models.AuthVerification
	if err := h.db.Where("id = ?", id).First(&v).Error; err != nil {
		t.Fatalf("load verification: %v", err)
	}
	if v.CodeHash == code {
		t.Fatal("the code was stored in plaintext")
	}
	if !strings.HasPrefix(v.CodeHash, "$2a$") && !strings.HasPrefix(v.CodeHash, "$2b$") {
		t.Fatalf("stored value %q does not look like bcrypt", v.CodeHash)
	}
}

func TestRequestCodeRejectsAnAlreadyRegisteredContact(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	h.registerFully(t, models.VerificationMethodPhone, phone)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/request",
		map[string]string{"method": "phone", "phone": phone}, "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("got status %d, want 409: %s", rec.Code, rec.Body.String())
	}
	if body := decode(t, rec); body.Error != "contact_taken" {
		t.Fatalf("got error code %q, want contact_taken", body.Error)
	}
}

func TestRequestCodeEnforcesTheResendCooldown(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	h.requestCode(t, models.VerificationMethodPhone, phone)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/request",
		map[string]string{"method": "phone", "phone": phone}, "")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("got status %d, want 429: %s", rec.Code, rec.Body.String())
	}
	if body := decode(t, rec); body.Error != "resend_too_soon" {
		t.Fatalf("got error code %q, want resend_too_soon", body.Error)
	}
}

func TestResendInvalidatesThePreviousCode(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	h.cleanupContact(t, models.VerificationMethodPhone, phone)

	firstID, firstCode := h.requestCode(t, models.VerificationMethodPhone, phone)

	// Move past the cooldown by rewinding what the database recorded.
	if err := h.db.Model(&models.AuthVerification{}).Where("id = ?", firstID).
		Update("last_sent_at", time.Now().Add(-2*time.Minute)).Error; err != nil {
		t.Fatalf("rewind cooldown: %v", err)
	}

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/request",
		map[string]string{"method": "phone", "phone": phone}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("resend got status %d, want 200: %s", rec.Code, rec.Body.String())
	}

	// The superseded code must no longer work.
	old := h.do(t, http.MethodPost, "/api/v1/auth/register/verify",
		map[string]string{"verification_id": firstID, "code": firstCode}, "")
	if old.Code == http.StatusOK {
		t.Fatal("the superseded verification still accepted its code")
	}
}

func TestRequestCodeRejectsAMismatchedContact(t *testing.T) {
	h := newHarness(t)

	for name, payload := range map[string]map[string]string{
		"phone method with email": {"method": "phone", "email": uniqueEmail()},
		"email method with phone": {"method": "email", "phone": uniquePhone()},
		"both contacts":           {"method": "phone", "phone": uniquePhone(), "email": uniqueEmail()},
		"no contact":              {"method": "phone"},
	} {
		t.Run(name, func(t *testing.T) {
			rec := h.do(t, http.MethodPost, "/api/v1/auth/register/request", payload, "")
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("got status %d, want 400: %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestRequestCodeValidation(t *testing.T) {
	h := newHarness(t)

	for name, payload := range map[string]map[string]string{
		"unknown method": {"method": "telepathy", "phone": uniquePhone()},
		"missing method": {"phone": uniquePhone()},
		"bad phone":      {"method": "phone", "phone": "12345"},
		"foreign phone":  {"method": "phone", "phone": "+12025550100"},
		"bad email":      {"method": "email", "email": "not-an-email"},
	} {
		t.Run(name, func(t *testing.T) {
			rec := h.do(t, http.MethodPost, "/api/v1/auth/register/request", payload, "")
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("got status %d, want 400: %s", rec.Code, rec.Body.String())
			}
		})
	}
}

// ---------- step 2: verify ----------

func TestVerifyAcceptsTheCorrectCode(t *testing.T) {
	h := newHarness(t)
	id, code := h.requestCode(t, models.VerificationMethodPhone, uniquePhone())

	regToken := h.verifyCode(t, id, code)
	if regToken == "" {
		t.Fatal("no registration token returned")
	}
}

func TestVerifyRejectsTheWrongCode(t *testing.T) {
	h := newHarness(t)
	id, code := h.requestCode(t, models.VerificationMethodPhone, uniquePhone())

	wrong := "000000"
	if code == wrong {
		wrong = "111111"
	}

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/verify",
		map[string]string{"verification_id": id, "code": wrong}, "")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got status %d, want 422: %s", rec.Code, rec.Body.String())
	}
	if body := decode(t, rec); body.Error != "invalid_code" {
		t.Fatalf("got error code %q, want invalid_code", body.Error)
	}
}

func TestVerifyCountsFailedAttempts(t *testing.T) {
	h := newHarness(t)
	id, code := h.requestCode(t, models.VerificationMethodPhone, uniquePhone())

	wrong := "000000"
	if code == wrong {
		wrong = "111111"
	}

	h.do(t, http.MethodPost, "/api/v1/auth/register/verify",
		map[string]string{"verification_id": id, "code": wrong}, "")

	var v models.AuthVerification
	if err := h.db.Where("id = ?", id).First(&v).Error; err != nil {
		t.Fatalf("load verification: %v", err)
	}
	if v.Attempts != 1 {
		t.Fatalf("got %d attempts recorded, want 1", v.Attempts)
	}
}

func TestVerifyRejectsAfterTooManyAttempts(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	id, code := h.requestCode(t, models.VerificationMethodPhone, phone)

	wrong := "000000"
	if code == wrong {
		wrong = "111111"
	}

	var last *httptest.ResponseRecorder
	for i := 0; i < h.policy.MaxAttempts; i++ {
		last = h.do(t, http.MethodPost, "/api/v1/auth/register/verify",
			map[string]string{"verification_id": id, "code": wrong}, "")
	}
	if last.Code != http.StatusTooManyRequests {
		t.Fatalf("final wrong attempt got status %d, want 429: %s", last.Code, last.Body.String())
	}

	// Even the correct code is refused once the limit is reached.
	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/verify",
		map[string]string{"verification_id": id, "code": code}, "")
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("got status %d, want 429 after the attempt limit: %s", rec.Code, rec.Body.String())
	}
}

func TestVerifyRejectsAnExpiredCode(t *testing.T) {
	h := newHarness(t)
	id, code := h.requestCode(t, models.VerificationMethodPhone, uniquePhone())

	// Age the row rather than waiting five minutes.
	if err := h.db.Model(&models.AuthVerification{}).Where("id = ?", id).
		Update("expires_at", time.Now().Add(-time.Minute)).Error; err != nil {
		t.Fatalf("expire verification: %v", err)
	}

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/verify",
		map[string]string{"verification_id": id, "code": code}, "")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got status %d, want 422: %s", rec.Code, rec.Body.String())
	}
	if body := decode(t, rec); body.Error != "code_expired" {
		t.Fatalf("got error code %q, want code_expired", body.Error)
	}
}

func TestVerifyRejectsAnUnknownVerification(t *testing.T) {
	h := newHarness(t)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/verify",
		map[string]string{"verification_id": uuid.NewString(), "code": "123456"}, "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("got status %d, want 404: %s", rec.Code, rec.Body.String())
	}
}

func TestVerifyValidation(t *testing.T) {
	h := newHarness(t)

	for name, payload := range map[string]map[string]string{
		"missing id":    {"code": "123456"},
		"missing code":  {"verification_id": uuid.NewString()},
		"id not a uuid": {"verification_id": "not-a-uuid", "code": "123456"},
		"short code":    {"verification_id": uuid.NewString(), "code": "12345"},
		"long code":     {"verification_id": uuid.NewString(), "code": "1234567"},
		"non-numeric":   {"verification_id": uuid.NewString(), "code": "12345a"},
	} {
		t.Run(name, func(t *testing.T) {
			rec := h.do(t, http.MethodPost, "/api/v1/auth/register/verify", payload, "")
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("got status %d, want 400: %s", rec.Code, rec.Body.String())
			}
		})
	}
}

// ---------- step 3: complete ----------

func TestCompleteRegistrationWithPhone(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()

	auth := h.registerFully(t, models.VerificationMethodPhone, phone)

	if auth.AccessToken == "" {
		t.Fatal("no access token returned")
	}
	if auth.TokenType != "Bearer" {
		t.Errorf("got token type %q, want Bearer", auth.TokenType)
	}
	if auth.User.Phone == nil || *auth.User.Phone != phone {
		t.Fatalf("got phone %v, want %s", auth.User.Phone, phone)
	}
	// Phone-only registration must not invent an email.
	if auth.User.Email != nil {
		t.Fatalf("got email %v, want nil for a phone-only registration", *auth.User.Email)
	}

	userID, err := h.tokens.Validate(auth.AccessToken)
	if err != nil {
		t.Fatalf("returned token does not validate: %v", err)
	}
	if userID.String() != auth.User.ID {
		t.Fatalf("token subject %s does not match user %s", userID, auth.User.ID)
	}
}

func TestCompleteRegistrationWithEmail(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()

	auth := h.registerFully(t, models.VerificationMethodEmail, email)

	if auth.User.Email == nil || *auth.User.Email != email {
		t.Fatalf("got email %v, want %s", auth.User.Email, email)
	}
	if auth.User.Phone != nil {
		t.Fatalf("got phone %v, want nil for an email-only registration", *auth.User.Phone)
	}
}

func TestCompleteRegistrationStoresAHashedPassword(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	h.registerFully(t, models.VerificationMethodPhone, phone)

	var user models.User
	if err := h.db.Where("phone = ?", phone).First(&user).Error; err != nil {
		t.Fatalf("load stored user: %v", err)
	}
	if user.PasswordHash == testPassword {
		t.Fatal("the password was stored in plaintext")
	}
	if !strings.HasPrefix(user.PasswordHash, "$2a$") && !strings.HasPrefix(user.PasswordHash, "$2b$") {
		t.Fatalf("stored hash %q does not look like bcrypt", user.PasswordHash)
	}
}

func TestCompleteRegistrationNeverReturnsThePasswordHash(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	h.cleanupContact(t, models.VerificationMethodPhone, phone)

	id, code := h.requestCode(t, models.VerificationMethodPhone, phone)
	regToken := h.verifyCode(t, id, code)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/complete", map[string]string{
		"registration_token":    regToken,
		"first_name":            "Samandar",
		"last_name":             "Hodiev",
		"password":              testPassword,
		"password_confirmation": testPassword,
	}, "")

	raw := rec.Body.String()
	for _, needle := range []string{"password_hash", "PasswordHash", "$2a$", "$2b$", testPassword} {
		if strings.Contains(raw, needle) {
			t.Errorf("response contains %q: %s", needle, raw)
		}
	}
}

func TestRegistrationTokenCannotBeReused(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()

	id, code := h.requestCode(t, models.VerificationMethodPhone, phone)
	regToken := h.verifyCode(t, id, code)
	h.completeRegistration(t, regToken)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/complete", map[string]string{
		"registration_token":    regToken,
		"first_name":            "Second",
		"last_name":             "Attempt",
		"password":              testPassword,
		"password_confirmation": testPassword,
	}, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401 for a reused token: %s", rec.Code, rec.Body.String())
	}
	if body := decode(t, rec); body.Error != "invalid_registration_token" {
		t.Fatalf("got error code %q", body.Error)
	}
}

func TestOTPCannotBeVerifiedTwice(t *testing.T) {
	// Caught in manual testing: a verified-but-unspent code used to be
	// accepted again, minting a second registration token and killing the
	// first one the caller was still holding.
	h := newHarness(t)
	id, code := h.requestCode(t, models.VerificationMethodPhone, uniquePhone())

	first := h.verifyCode(t, id, code)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/verify",
		map[string]string{"verification_id": id, "code": code}, "")
	if rec.Code == http.StatusOK {
		t.Fatalf("the code was accepted a second time: %s", rec.Body.String())
	}

	// The token handed out the first time must still work.
	complete := h.do(t, http.MethodPost, "/api/v1/auth/register/complete", map[string]string{
		"registration_token":    first,
		"first_name":            "Samandar",
		"last_name":             "Hodiev",
		"password":              testPassword,
		"password_confirmation": testPassword,
	}, "")
	if complete.Code != http.StatusCreated {
		t.Fatalf("the original token stopped working: %d %s", complete.Code, complete.Body.String())
	}
}

func TestOTPCannotBeReusedAfterRegistration(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()

	id, code := h.requestCode(t, models.VerificationMethodPhone, phone)
	regToken := h.verifyCode(t, id, code)
	h.completeRegistration(t, regToken)

	// The same code, on the same verification, must be dead.
	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/verify",
		map[string]string{"verification_id": id, "code": code}, "")
	if rec.Code == http.StatusOK {
		t.Fatalf("the spent verification accepted its code again: %s", rec.Body.String())
	}
}

func TestCompleteRegistrationRejectsAnExpiredToken(t *testing.T) {
	h := newHarness(t)
	id, code := h.requestCode(t, models.VerificationMethodPhone, uniquePhone())
	regToken := h.verifyCode(t, id, code)

	if err := h.db.Model(&models.AuthVerification{}).Where("id = ?", id).
		Update("registration_token_expires_at", time.Now().Add(-time.Minute)).Error; err != nil {
		t.Fatalf("expire token: %v", err)
	}

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/complete", map[string]string{
		"registration_token":    regToken,
		"first_name":            "Samandar",
		"last_name":             "Hodiev",
		"password":              testPassword,
		"password_confirmation": testPassword,
	}, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401: %s", rec.Code, rec.Body.String())
	}
}

func TestCompleteRegistrationRejectsAnUnverifiedSession(t *testing.T) {
	h := newHarness(t)
	h.requestCode(t, models.VerificationMethodPhone, uniquePhone())

	// A token that was never issued cannot match any row.
	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/complete", map[string]string{
		"registration_token":    "a-token-that-was-never-issued",
		"first_name":            "Samandar",
		"last_name":             "Hodiev",
		"password":              testPassword,
		"password_confirmation": testPassword,
	}, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401: %s", rec.Code, rec.Body.String())
	}
}

func TestCompleteRegistrationValidation(t *testing.T) {
	h := newHarness(t)
	id, code := h.requestCode(t, models.VerificationMethodPhone, uniquePhone())
	regToken := h.verifyCode(t, id, code)

	base := func() map[string]string {
		return map[string]string{
			"registration_token":    regToken,
			"first_name":            "Samandar",
			"last_name":             "Hodiev",
			"password":              testPassword,
			"password_confirmation": testPassword,
		}
	}

	cases := map[string]func(map[string]string){
		"missing token":      func(p map[string]string) { delete(p, "registration_token") },
		"missing first name": func(p map[string]string) { delete(p, "first_name") },
		"short first name":   func(p map[string]string) { p["first_name"] = "A" },
		"missing last name":  func(p map[string]string) { delete(p, "last_name") },
		"short password":     func(p map[string]string) { p["password"] = "short"; p["password_confirmation"] = "short" },
		"overlong password": func(p map[string]string) {
			long := strings.Repeat("a", 73)
			p["password"] = long
			p["password_confirmation"] = long
		},
		"mismatched password":  func(p map[string]string) { p["password_confirmation"] = "DifferentPassword123" },
		"missing confirmation": func(p map[string]string) { delete(p, "password_confirmation") },
		"unknown language":     func(p map[string]string) { p["language"] = "de" },
	}

	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			payload := base()
			mutate(payload)

			rec := h.do(t, http.MethodPost, "/api/v1/auth/register/complete", payload, "")
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("got status %d, want 400: %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestDuplicatePhoneIsRejected(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	h.registerFully(t, models.VerificationMethodPhone, phone)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/request",
		map[string]string{"method": "phone", "phone": phone}, "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("got status %d, want 409: %s", rec.Code, rec.Body.String())
	}
}

func TestDuplicateEmailIsRejected(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()
	h.registerFully(t, models.VerificationMethodEmail, email)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/register/request",
		map[string]string{"method": "email", "email": email}, "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("got status %d, want 409: %s", rec.Code, rec.Body.String())
	}
}

// ---------- login ----------

func TestLoginWithEmail(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()
	h.registerFully(t, models.VerificationMethodEmail, email)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": email, "password": testPassword}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200: %s", rec.Code, rec.Body.String())
	}

	var auth dto.AuthResponse
	_ = json.Unmarshal(decode(t, rec).Data, &auth)
	if auth.AccessToken == "" {
		t.Fatal("no access token returned")
	}
}

func TestLoginWithPhone(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	h.registerFully(t, models.VerificationMethodPhone, phone)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": phone, "password": testPassword}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200: %s", rec.Code, rec.Body.String())
	}
}

func TestLoginAcceptsAnUnformattedPhone(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	h.registerFully(t, models.VerificationMethodPhone, phone)

	// The same number as the user would type it on a form.
	spaced := fmt.Sprintf("%s %s %s %s %s", phone[:4], phone[4:6], phone[6:9], phone[9:11], phone[11:])
	rec := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": spaced, "password": testPassword}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d for %q, want 200: %s", rec.Code, spaced, rec.Body.String())
	}
}

func TestLoginWithADifferentlyCasedEmail(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()
	h.registerFully(t, models.VerificationMethodEmail, email)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": strings.ToUpper(email), "password": testPassword}, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200: %s", rec.Code, rec.Body.String())
	}
}

func TestLoginWithAWrongPassword(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()
	h.registerFully(t, models.VerificationMethodEmail, email)

	rec := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": email, "password": "WrongPassword123"}, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401: %s", rec.Code, rec.Body.String())
	}
	if body := decode(t, rec); body.Message != "Invalid credentials" {
		t.Fatalf("got message %q, want the generic one", body.Message)
	}
}

func TestLoginDoesNotRevealWhetherAnAccountExists(t *testing.T) {
	h := newHarness(t)
	email := uniqueEmail()
	h.registerFully(t, models.VerificationMethodEmail, email)

	known := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": email, "password": "WrongPassword123"}, "")
	unknown := h.do(t, http.MethodPost, "/api/v1/auth/login",
		map[string]string{"identifier": uniqueEmail(), "password": "WrongPassword123"}, "")

	if known.Code != unknown.Code || known.Body.String() != unknown.Body.String() {
		t.Fatalf("responses differ:\n known:   %d %s\n unknown: %d %s",
			known.Code, known.Body.String(), unknown.Code, unknown.Body.String())
	}
}

func TestLoginValidation(t *testing.T) {
	h := newHarness(t)

	for name, payload := range map[string]map[string]string{
		"missing identifier": {"password": testPassword},
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

// ---------- /me ----------

func TestMeReturnsTheAuthenticatedUser(t *testing.T) {
	h := newHarness(t)
	phone := uniquePhone()
	auth := h.registerFully(t, models.VerificationMethodPhone, phone)

	rec := h.do(t, http.MethodGet, "/api/v1/auth/me", nil, "Bearer "+auth.AccessToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200: %s", rec.Code, rec.Body.String())
	}

	var user dto.UserResponse
	if err := json.Unmarshal(decode(t, rec).Data, &user); err != nil {
		t.Fatalf("decode user: %v", err)
	}
	if user.ID != auth.User.ID || user.Phone == nil || *user.Phone != phone {
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
			if body := decode(t, rec); body.Success || body.Error == "" {
				t.Fatalf("got %+v, want a failure with an error code", body)
			}
		})
	}
}

func TestMeRejectsAnExpiredToken(t *testing.T) {
	h := newHarness(t)
	auth := h.registerFully(t, models.VerificationMethodPhone, uniquePhone())

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
	if body := decode(t, rec); body.Error != "token_expired" {
		t.Fatalf("got error code %q, want token_expired", body.Error)
	}
}

func TestMeRejectsAForeignSignature(t *testing.T) {
	h := newHarness(t)
	auth := h.registerFully(t, models.VerificationMethodPhone, uniquePhone())

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
	phone := uniquePhone()
	auth := h.registerFully(t, models.VerificationMethodPhone, phone)

	h.db.Unscoped().Where("phone = ?", phone).Delete(&models.User{})

	rec := h.do(t, http.MethodGet, "/api/v1/auth/me", nil, "Bearer "+auth.AccessToken)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401: %s", rec.Code, rec.Body.String())
	}
}
