package middleware

import (
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// window is one caller's request count for the bucket currently in effect.
type window struct {
	count   int
	resetAt time.Time
}

// sweepThreshold bounds how large the map is allowed to grow between cleanups.
// An attacker sending one request from many addresses would otherwise leave
// one abandoned entry per address forever.
const sweepThreshold = 1000

// RateLimiter caps how many requests one key may make inside a rolling
// window, entirely in memory.
//
// RentHouse runs as a single process, so a shared in-memory map needs no
// external store such as Redis. If it is ever run as more than one instance,
// the limit becomes per-instance rather than global — which only makes it
// more generous, never less safe, so it degrades in the right direction.
type RateLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	entries map[string]*window
}

// NewRateLimiter builds a limiter allowing limit requests per key inside per.
func NewRateLimiter(limit int, per time.Duration) *RateLimiter {
	return &RateLimiter{
		limit:   limit,
		window:  per,
		entries: make(map[string]*window),
	}
}

// Allow reports whether one more request for key fits inside the current
// window and, if so, counts it. When it does not, the second result is how
// long the caller should wait before trying again.
func (l *RateLimiter) Allow(key string, now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	w, ok := l.entries[key]
	if !ok || !now.Before(w.resetAt) {
		w = &window{resetAt: now.Add(l.window)}
		l.entries[key] = w
	}
	if w.count >= l.limit {
		return false, w.resetAt.Sub(now)
	}
	w.count++

	if len(l.entries) > sweepThreshold {
		l.sweep(now)
	}
	return true, 0
}

// sweep drops every entry whose window has already lapsed. Called with mu
// already held.
func (l *RateLimiter) sweep(now time.Time) {
	for key, entry := range l.entries {
		if !now.Before(entry.resetAt) {
			delete(l.entries, key)
		}
	}
}

// RateLimit rejects a caller who exceeds limit requests per window, keyed by
// client IP address.
//
// It exists for endpoints a script can hit without ever holding a session —
// requesting a registration code, requesting a password reset, publishing a
// listing — where an account lockout offers no protection because there is
// either no account yet or the account itself is not what needs throttling.
func RateLimit(limit int, window time.Duration) gin.HandlerFunc {
	limiter := NewRateLimiter(limit, window)
	return RateLimitWith(limiter)
}

// RateLimitWith is RateLimit built on a limiter the caller already owns, so a
// test can inspect or share one instead of each middleware call getting its
// own.
func RateLimitWith(limiter *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		allowed, retryAfter := limiter.Allow(c.ClientIP(), time.Now())
		if !allowed {
			c.Header("Retry-After", strconv.Itoa(int(retryAfter.Seconds())+1))
			response.AbortWithError(c, http.StatusTooManyRequests, "rate_limited",
				"Too many requests. Please try again later.")
			return
		}
		c.Next()
	}
}
