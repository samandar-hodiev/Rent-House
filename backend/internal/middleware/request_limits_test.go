package middleware

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func newLimitedRouter(max int64) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(LimitRequestBody(max))
	router.POST("/echo", func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.String(http.StatusRequestEntityTooLarge, "too large")
			return
		}
		c.String(http.StatusOK, "%d", len(body))
	})
	return router
}

func TestLimitRequestBodyAllowsUnderTheLimit(t *testing.T) {
	router := newLimitedRouter(10)
	req := httptest.NewRequest(http.MethodPost, "/echo", bytes.NewReader([]byte("small")))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "5" {
		t.Fatalf("got body %q, want the byte count 5", rec.Body.String())
	}
}

func TestLimitRequestBodyStopsReadingPastTheLimit(t *testing.T) {
	router := newLimitedRouter(10)
	req := httptest.NewRequest(http.MethodPost, "/echo", bytes.NewReader(bytes.Repeat([]byte("x"), 1000)))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("got status %d, want 413: %s", rec.Code, rec.Body.String())
	}
}
