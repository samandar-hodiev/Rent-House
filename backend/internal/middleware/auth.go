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
			response.AbortWithError(c, http.StatusUnauthorized, "missing_token", "Authorization header is required")
			return
		}

		// The scheme is compared case-insensitively, as RFC 7235 requires, but
		// the token itself is taken verbatim.
		if len(header) < len(bearerPrefix) || !strings.EqualFold(header[:len(bearerPrefix)], bearerPrefix) {
			response.AbortWithError(c, http.StatusUnauthorized, "malformed_token", "Authorization header must be 'Bearer <token>'")
			return
		}

		raw := strings.TrimSpace(header[len(bearerPrefix):])
		if raw == "" {
			response.AbortWithError(c, http.StatusUnauthorized, "malformed_token", "Authorization header must be 'Bearer <token>'")
			return
		}

		userID, err := tokens.Validate(raw)
		if err != nil {
			// Expiry is worth distinguishing: a client can act on it by signing
			// in again. Every other failure stays a single opaque message.
			if err == token.ErrExpiredToken {
				response.AbortWithError(c, http.StatusUnauthorized, "token_expired", "Token has expired")
				return
			}
			response.AbortWithError(c, http.StatusUnauthorized, "invalid_token", "Invalid token")
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

// OptionalAuth identifies the caller when they present a valid token, and lets
// them through as an anonymous visitor when they do not.
//
// It exists for endpoints that are public but answer differently for the owner:
// the apartment detail page is readable by anyone, yet an owner opening their
// own unpublished draft must see it while a stranger must not. Requiring a
// token there would break browsing; ignoring one would hide a draft from the
// person who wrote it.
//
// A malformed or expired token is treated as no token at all rather than as an
// error. The request is valid without one, so there is nothing to reject — and
// a stale token in an old tab should degrade to browsing, not to a wall.
func OptionalAuth(tokens *token.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if len(header) < len(bearerPrefix) ||
			!strings.EqualFold(header[:len(bearerPrefix)], bearerPrefix) {
			c.Next()
			return
		}

		raw := strings.TrimSpace(header[len(bearerPrefix):])
		if raw == "" {
			c.Next()
			return
		}

		if userID, err := tokens.Validate(raw); err == nil {
			c.Set(userIDKey.name, userID)
		}
		c.Next()
	}
}

// QueryAuth accepts the access token from the Authorization header or, failing
// that, from a `token` query parameter.
//
// It exists for URLs a browser fetches without JavaScript in the loop: an
// <img src>, an <audio src>, a download link. None of those can carry a header,
// so a protected attachment would be unreachable without this — and serving
// those files statically instead would make every chat attachment public to
// anyone who learned its address.
//
// The trade-off is that the token appears in a URL, where it can reach browser
// history and any intermediary's logs. It is the same short-lived access token
// used everywhere else, and the alternative is worse.
func QueryAuth(tokens *token.Service) gin.HandlerFunc {
	header := Auth(tokens)

	return func(c *gin.Context) {
		if c.GetHeader("Authorization") != "" {
			header(c)
			return
		}

		raw := strings.TrimSpace(c.Query("token"))
		if raw == "" {
			response.AbortWithError(c, http.StatusUnauthorized, "missing_token",
				"Authentication required")
			return
		}

		userID, err := tokens.Validate(raw)
		if err != nil {
			response.AbortWithError(c, http.StatusUnauthorized, "invalid_token", "Invalid token")
			return
		}

		c.Set(userIDKey.name, userID)
		c.Next()
	}
}
