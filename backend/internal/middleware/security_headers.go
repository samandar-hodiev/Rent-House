package middleware

import "github.com/gin-gonic/gin"

// SecurityHeaders sets the handful of response headers that cost nothing and
// close off a class of browser-side attack regardless of what a handler does.
//
// This API is reached two ways: through nginx (frontend/nginx.conf sets the
// same headers there, for browsers that only ever talk to nginx) and directly
// on its own published port for debugging (see docker-compose.yml) — this is
// what covers that second path, and what protects the one response nginx
// merely proxies rather than generates itself: an uploaded file served back
// under /uploads. No Content-Security-Policy here for the same reason nginx's
// doesn't have one — see the comment there.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	}
}
