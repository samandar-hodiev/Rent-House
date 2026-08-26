package middleware

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

var adminKey = contextKey{name: "auth.admin"}

// AdminAuth authenticates a dashboard request.
//
// Two things happen here that the marketplace's Auth does not do. The token
// must carry the admin audience, so a signed-in visitor's token cannot be
// presented to the admin API. And the account is loaded on every request, so an
// owner who suspends somebody takes effect immediately rather than whenever
// that person's token happens to expire.
func AdminAuth(tokens *token.Service, admins *service.AdminService) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if len(header) < len(bearerPrefix) ||
			!strings.EqualFold(header[:len(bearerPrefix)], bearerPrefix) {
			response.AbortWithError(c, http.StatusUnauthorized, "missing_token",
				"Authentication required")
			return
		}

		raw := strings.TrimSpace(header[len(bearerPrefix):])
		if raw == "" {
			response.AbortWithError(c, http.StatusUnauthorized, "missing_token",
				"Authentication required")
			return
		}

		adminID, err := tokens.ValidateScoped(raw, token.ScopeAdmin)
		if err != nil {
			if errors.Is(err, token.ErrExpiredToken) {
				response.AbortWithError(c, http.StatusUnauthorized, "token_expired",
					"Session has expired")
				return
			}
			response.AbortWithError(c, http.StatusUnauthorized, "invalid_token", "Invalid token")
			return
		}

		admin, err := admins.Authenticate(c.Request.Context(), adminID)
		if err != nil {
			switch {
			case errors.Is(err, service.ErrAdminNotFound):
				response.AbortWithError(c, http.StatusUnauthorized, "invalid_token", "Invalid token")
			case errors.Is(err, service.ErrAdminSuspended):
				response.AbortWithError(c, http.StatusForbidden, "account_suspended",
					"This account is suspended")
			case errors.Is(err, service.ErrAdminInactive):
				response.AbortWithError(c, http.StatusForbidden, "account_inactive",
					"This account is not active")
			default:
				logger.Errorf("admin auth: %v", err)
				response.AbortWithError(c, http.StatusInternalServerError, "internal_error",
					"Could not verify the session")
			}
			return
		}

		c.Set(adminKey.name, admin)
		c.Next()
	}
}

// AdminFrom returns the authenticated administrator. The second result is false
// when the request did not pass through AdminAuth, so a handler cannot mistake
// an unauthenticated request for an administrator.
func AdminFrom(c *gin.Context) (*models.Admin, bool) {
	value, exists := c.Get(adminKey.name)
	if !exists {
		return nil, false
	}
	admin, ok := value.(*models.Admin)
	return admin, ok
}

// RequireOwner refuses anyone but the owner.
//
// Mounted on the routes that manage administrators and the dashboard's own
// configuration. It runs on the server, so hiding the matching link in the
// sidebar is a courtesy to the reader rather than the thing keeping them out.
func RequireOwner() gin.HandlerFunc {
	return func(c *gin.Context) {
		admin, ok := AdminFrom(c)
		if !ok {
			response.AbortWithError(c, http.StatusUnauthorized, "missing_token",
				"Authentication required")
			return
		}
		if !admin.IsOwner() {
			response.AbortWithError(c, http.StatusForbidden, "forbidden",
				"This action is reserved for the owner")
			return
		}
		c.Next()
	}
}

// RequireSection refuses an administrator whose sidebar section the owner has
// switched off.
//
// This is what makes the sidebar configuration a permission rather than a
// decoration: a super admin who cannot see "Foydalanuvchilar" in the navigation
// also cannot fetch it by typing the URL or calling the endpoint directly.
func RequireSection(admins *service.AdminService, section string) gin.HandlerFunc {
	return func(c *gin.Context) {
		admin, ok := AdminFrom(c)
		if !ok {
			response.AbortWithError(c, http.StatusUnauthorized, "missing_token",
				"Authentication required")
			return
		}

		allowed, err := admins.MayUseSection(c.Request.Context(), admin, section)
		if err != nil {
			logger.Errorf("section check: %v", err)
			response.AbortWithError(c, http.StatusInternalServerError, "internal_error",
				"Could not verify permissions")
			return
		}
		if !allowed {
			response.AbortWithError(c, http.StatusForbidden, "forbidden",
				"This section is not available for your account")
			return
		}
		c.Next()
	}
}
