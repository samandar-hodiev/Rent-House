// Package handler holds the HTTP layer: bind, delegate, respond. No business
// rules and no database access live here.
package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// AuthHandler serves the authentication endpoints.
type AuthHandler struct {
	auth *service.AuthService
}

func NewAuthHandler(auth *service.AuthService) *AuthHandler {
	return &AuthHandler{auth: auth}
}

// Register handles POST /api/v1/auth/register.
func (h *AuthHandler) Register(c *gin.Context) {
	var req dto.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// The validator's message names the offending field without echoing the
		// password value back, so it is safe to return.
		response.Error(c, http.StatusBadRequest, validationMessage(err))
		return
	}
	req.Normalize()

	result, err := h.auth.Register(req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrUserExists):
			response.Error(c, http.StatusConflict, "User already exists")
		default:
			// The detail goes to the log; the client gets nothing internal.
			logger.Errorf("register: %v", err)
			response.Error(c, http.StatusInternalServerError, "Could not complete registration")
		}
		return
	}

	response.Success(c, http.StatusCreated, "Registration successful", result)
}

// Login handles POST /api/v1/auth/login.
func (h *AuthHandler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, validationMessage(err))
		return
	}
	req.Normalize()

	result, err := h.auth.Login(req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidCredentials):
			// One message for a wrong password and for an unknown account.
			response.Error(c, http.StatusUnauthorized, "Invalid credentials")
		default:
			logger.Errorf("login: %v", err)
			response.Error(c, http.StatusInternalServerError, "Could not complete login")
		}
		return
	}

	response.OK(c, "Login successful", result)
}

// Me handles GET /api/v1/auth/me and runs behind the auth middleware.
func (h *AuthHandler) Me(c *gin.Context) {
	userID, ok := middleware.UserIDFrom(c)
	if !ok {
		// Only reachable if the route were mounted without the middleware.
		response.Error(c, http.StatusUnauthorized, "Authentication required")
		return
	}

	user, err := h.auth.CurrentUser(userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrUserNotFound):
			// A valid token for an account that no longer exists.
			response.Error(c, http.StatusUnauthorized, "Invalid token")
		default:
			logger.Errorf("current user: %v", err)
			response.Error(c, http.StatusInternalServerError, "Could not load the current user")
		}
		return
	}

	response.OK(c, "Authenticated user", user)
}

// validationMessage turns a binding error into something a client can act on
// without exposing internals.
func validationMessage(err error) string {
	if err == nil {
		return "Invalid request"
	}
	return "Invalid request: " + err.Error()
}
