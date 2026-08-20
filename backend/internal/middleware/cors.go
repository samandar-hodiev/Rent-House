// Package middleware holds the HTTP middleware shared across routes.
package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	allowedMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
	allowedHeaders = "Authorization, Content-Type"
	maxAgeSeconds  = "600"
)

// CORS allows browser requests from the configured origins only.
//
// It reflects the request's origin when it is on the allow-list rather than
// answering "*": a wildcard cannot be combined with credentials, and echoing an
// approved origin keeps the door open for cookie-based auth later without
// widening access now. Requests from other origins simply get no CORS headers,
// which is what makes the browser block them.
func CORS(allowedOrigins []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		allowed[strings.TrimSpace(origin)] = struct{}{}
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if _, ok := allowed[origin]; ok {
			header := c.Writer.Header()
			header.Set("Access-Control-Allow-Origin", origin)
			header.Set("Access-Control-Allow-Methods", allowedMethods)
			header.Set("Access-Control-Allow-Headers", allowedHeaders)
			header.Set("Access-Control-Max-Age", maxAgeSeconds)
			// Caches must not serve one origin's response to another.
			header.Add("Vary", "Origin")
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
