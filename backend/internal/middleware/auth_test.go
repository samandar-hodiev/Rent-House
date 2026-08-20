package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
)

const authTestSecret = "middleware-test-secret"

func authRouter(t *testing.T) (*gin.Engine, *token.Service) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	tokens, err := token.New(authTestSecret, time.Hour)
	if err != nil {
		t.Fatalf("build token service: %v", err)
	}

	router := gin.New()
	router.GET("/protected", Auth(tokens), func(c *gin.Context) {
		userID, ok := UserIDFrom(c)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "no user in context"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"user_id": userID.String()})
	})
	return router, tokens
}

func call(t *testing.T, router *gin.Engine, header string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	if header != "" {
		req.Header.Set("Authorization", header)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestValidTokenReachesTheHandler(t *testing.T) {
	router, tokens := authRouter(t)
	userID := uuid.New()

	raw, _, err := tokens.Generate(userID)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}

	rec := call(t, router, "Bearer "+raw)
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200: %s", rec.Code, rec.Body.String())
	}

	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["user_id"] != userID.String() {
		t.Fatalf("handler saw %q, want %q", body["user_id"], userID)
	}
}

func TestMissingAuthorizationHeaderIsRejected(t *testing.T) {
	router, _ := authRouter(t)

	rec := call(t, router, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"success":false`) {
		t.Fatalf("body %q should use the shared failure envelope", rec.Body.String())
	}
}

func TestMalformedAuthorizationHeaderIsRejected(t *testing.T) {
	router, tokens := authRouter(t)
	raw, _, _ := tokens.Generate(uuid.New())

	for _, header := range []string{
		raw,              // no scheme
		"Basic " + raw,   // wrong scheme
		"Bearer",         // scheme only
		"Bearer ",        // empty token
		"Bearer  ",       // whitespace token
		"BearerX " + raw, // near-miss scheme
	} {
		rec := call(t, router, header)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("header %q got status %d, want 401", header, rec.Code)
		}
	}
}

func TestSchemeIsCaseInsensitive(t *testing.T) {
	router, tokens := authRouter(t)
	raw, _, _ := tokens.Generate(uuid.New())

	// RFC 7235 makes the auth scheme case-insensitive.
	for _, header := range []string{"bearer " + raw, "BEARER " + raw, "BeArEr " + raw} {
		if rec := call(t, router, header); rec.Code != http.StatusOK {
			t.Errorf("header %q got status %d, want 200", header, rec.Code)
		}
	}
}

func TestExpiredTokenIsRejectedWithAUsefulMessage(t *testing.T) {
	router, _ := authRouter(t)

	claims := jwt.RegisteredClaims{
		Subject:   uuid.New().String(),
		IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
	}
	raw, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(authTestSecret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	rec := call(t, router, "Bearer "+raw)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "expired") {
		t.Fatalf("body %q should tell the client to sign in again", rec.Body.String())
	}
}

func TestTokenSignedWithAnotherSecretIsRejected(t *testing.T) {
	router, _ := authRouter(t)

	other, _ := token.New("a-different-secret", time.Hour)
	raw, _, _ := other.Generate(uuid.New())

	if rec := call(t, router, "Bearer "+raw); rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401", rec.Code)
	}
}

func TestUnsignedTokenIsRejected(t *testing.T) {
	router, _ := authRouter(t)

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

	if rec := call(t, router, "Bearer "+raw); rec.Code != http.StatusUnauthorized {
		t.Fatalf("alg=none got status %d, want 401", rec.Code)
	}
}

func TestUserIDFromReportsAbsence(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	if _, ok := UserIDFrom(c); ok {
		t.Fatal("an unauthenticated context must not yield a user id")
	}
}

func TestContextValueCannotBeForgedByAStringKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())

	// A handler setting a plausible key must not be mistaken for authentication.
	c.Set("user_id", uuid.New())
	if _, ok := UserIDFrom(c); ok {
		t.Fatal("a foreign context key was accepted as an authenticated user")
	}
}
