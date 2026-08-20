package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func newTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(CORS([]string{"http://localhost:5173"}))
	router.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	return router
}

func do(t *testing.T, method, origin string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, "/health", nil)
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	rec := httptest.NewRecorder()
	newTestRouter().ServeHTTP(rec, req)
	return rec
}

func TestAllowedOriginIsEchoedBack(t *testing.T) {
	rec := do(t, http.MethodGet, "http://localhost:5173")

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("got %q, want the request origin echoed back", got)
	}
	if got := rec.Header().Get("Vary"); got != "Origin" {
		t.Fatalf("Vary header is %q, want Origin so caches do not cross origins", got)
	}
}

func TestDisallowedOriginGetsNoCORSHeaders(t *testing.T) {
	rec := do(t, http.MethodGet, "http://evil.test")

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("got %q, want no allow-origin header for an unlisted origin", got)
	}
}

func TestNoWildcardOrigin(t *testing.T) {
	rec := do(t, http.MethodGet, "http://localhost:5173")

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got == "*" {
		t.Fatal("allow-origin must not be a wildcard")
	}
}

func TestPreflightIsAnsweredWithoutReachingTheHandler(t *testing.T) {
	rec := do(t, http.MethodOptions, "http://localhost:5173")

	if rec.Code != http.StatusNoContent {
		t.Fatalf("got status %d, want %d", rec.Code, http.StatusNoContent)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Fatal("preflight response is missing Access-Control-Allow-Methods")
	}
	if body := rec.Body.String(); body != "" {
		t.Fatalf("preflight wrote a body %q, want none", body)
	}
}
