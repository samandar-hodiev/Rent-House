package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestAllowPermitsUpToTheLimit(t *testing.T) {
	limiter := NewRateLimiter(3, time.Minute)
	now := time.Now()

	for i := 0; i < 3; i++ {
		allowed, _ := limiter.Allow("1.2.3.4", now)
		if !allowed {
			t.Fatalf("request %d: got denied, want allowed within the limit", i+1)
		}
	}
}

func TestAllowDeniesOnceTheLimitIsUsedUp(t *testing.T) {
	limiter := NewRateLimiter(2, time.Minute)
	now := time.Now()

	limiter.Allow("1.2.3.4", now)
	limiter.Allow("1.2.3.4", now)

	allowed, retryAfter := limiter.Allow("1.2.3.4", now)
	if allowed {
		t.Fatal("expected the third request in the window to be denied")
	}
	if retryAfter <= 0 {
		t.Fatalf("got retryAfter %v, want a positive wait", retryAfter)
	}
}

func TestAllowTracksEachKeySeparately(t *testing.T) {
	limiter := NewRateLimiter(1, time.Minute)
	now := time.Now()

	if allowed, _ := limiter.Allow("1.2.3.4", now); !allowed {
		t.Fatal("first caller's first request should be allowed")
	}
	if allowed, _ := limiter.Allow("5.6.7.8", now); !allowed {
		t.Fatal("a different caller must not be throttled by the first one's usage")
	}
	if allowed, _ := limiter.Allow("1.2.3.4", now); allowed {
		t.Fatal("the first caller's second request should be denied")
	}
}

func TestAllowResetsOnceTheWindowLapses(t *testing.T) {
	limiter := NewRateLimiter(1, time.Minute)
	now := time.Now()

	limiter.Allow("1.2.3.4", now)
	if allowed, _ := limiter.Allow("1.2.3.4", now.Add(30*time.Second)); allowed {
		t.Fatal("expected the caller to still be within the original window")
	}
	if allowed, _ := limiter.Allow("1.2.3.4", now.Add(61*time.Second)); !allowed {
		t.Fatal("expected a fresh window to allow the request again")
	}
}

func newRateLimitTestRouter(limiter *RateLimiter) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(RateLimitWith(limiter))
	router.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	return router
}

func TestRateLimitMiddlewareRejectsOverTheCap(t *testing.T) {
	router := newRateLimitTestRouter(NewRateLimiter(1, time.Minute))

	first := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	router.ServeHTTP(first, req)
	if first.Code != http.StatusOK {
		t.Fatalf("first request: got status %d, want 200", first.Code)
	}

	second := httptest.NewRecorder()
	router.ServeHTTP(second, httptest.NewRequest(http.MethodGet, "/health", nil))
	if second.Code != http.StatusTooManyRequests {
		t.Fatalf("second request: got status %d, want 429", second.Code)
	}
	if second.Header().Get("Retry-After") == "" {
		t.Fatal("expected a Retry-After header on a throttled response")
	}
}

func TestRateLimitMiddlewareDoesNotAbortAnAllowedRequest(t *testing.T) {
	router := newRateLimitTestRouter(NewRateLimiter(5, time.Minute))

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200", rec.Code)
	}
}
