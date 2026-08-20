package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// contextKey is unexported so no other package can write to the slot the
// middleware owns; a handler downstream cannot forge an authenticated user by
// setting the same string key.
type contextKey struct{ name string }

var userIDKey = contextKey{name: "auth.user_id"}

const bearerPrefix = "Bearer "

// Auth rejects any request without a valid access token.
//
// It verifies the token and nothing else — no database round trip on every
// request. A signed, unexpired token is enough to identify the caller; handlers
// that need the account itself load it, and so notice if it has since gone.
func Auth(tokens *token.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			response.AbortWithError(c, http.StatusUnauthorized, "Authorization header is required")
			return
		}

		// The scheme is compared case-insensitively, as RFC 7235 requires, but
		// the token itself is taken verbatim.
		if len(header) < len(bearerPrefix) || !strings.EqualFold(header[:len(bearerPrefix)], bearerPrefix) {
			response.AbortWithError(c, http.StatusUnauthorized, "Authorization header must be 'Bearer <token>'")
			return
		}

		raw := strings.TrimSpace(header[len(bearerPrefix):])
		if raw == "" {
			response.AbortWithError(c, http.StatusUnauthorized, "Authorization header must be 'Bearer <token>'")
			return
		}

		userID, err := tokens.Validate(raw)
		if err != nil {
			// Expiry is worth distinguishing: a client can act on it by signing
			// in again. Every other failure stays a single opaque message.
			if err == token.ErrExpiredToken {
				response.AbortWithError(c, http.StatusUnauthorized, "Token has expired")
				return
			}
			response.AbortWithError(c, http.StatusUnauthorized, "Invalid token")
			return
		}

		c.Set(userIDKey.name, userID)
		c.Next()
	}
}

// UserIDFrom returns the authenticated user's id. The second result is false
// when the request did not pass through Auth, so a handler cannot mistake an
// unauthenticated request for user zero.
func UserIDFrom(c *gin.Context) (uuid.UUID, bool) {
	value, exists := c.Get(userIDKey.name)
	if !exists {
		return uuid.Nil, false
	}
	userID, ok := value.(uuid.UUID)
	return userID, ok
}
