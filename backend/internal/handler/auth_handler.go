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

// RequestRegistrationCode handles POST /api/v1/auth/register/request.
func (h *AuthHandler) RequestRegistrationCode(c *gin.Context) {
	var req dto.RegisterRequestOTP
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	req.Normalize()

	result, err := h.auth.RequestRegistrationCode(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrContactMismatch):
			response.Error(c, http.StatusBadRequest, "contact_mismatch",
				"Provide exactly the contact that matches the chosen method")
		case errors.Is(err, service.ErrContactTaken):
			response.Error(c, http.StatusConflict, "contact_taken",
				"This phone or email is already registered")
		case errors.Is(err, service.ErrResendTooSoon):
			response.Error(c, http.StatusTooManyRequests, "resend_too_soon",
				"Please wait before requesting another code")
		default:
			logger.Errorf("request registration code: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error",
				"Could not send the verification code")
		}
		return
	}

	response.OK(c, "Verification code sent", result)
}

// VerifyRegistrationCode handles POST /api/v1/auth/register/verify.
func (h *AuthHandler) VerifyRegistrationCode(c *gin.Context) {
	var req dto.VerifyOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	req.Normalize()

	result, err := h.auth.VerifyRegistrationCode(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrVerificationNotFound):
			response.Error(c, http.StatusNotFound, "verification_not_found",
				"This verification is no longer available")
		case errors.Is(err, service.ErrVerificationExpired):
			response.Error(c, http.StatusUnprocessableEntity, "code_expired",
				"The verification code has expired")
		case errors.Is(err, service.ErrTooManyAttempts):
			response.Error(c, http.StatusTooManyRequests, "too_many_attempts",
				"Too many incorrect attempts. Request a new code")
		case errors.Is(err, service.ErrInvalidCode):
			response.Error(c, http.StatusUnprocessableEntity, "invalid_code",
				"The verification code is incorrect")
		default:
			logger.Errorf("verify registration code: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error",
				"Could not verify the code")
		}
		return
	}

	response.OK(c, "Verification successful", result)
}

// CompleteRegistration handles POST /api/v1/auth/register/complete.
func (h *AuthHandler) CompleteRegistration(c *gin.Context) {
	var req dto.CompleteRegistrationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	req.Normalize()

	result, err := h.auth.CompleteRegistration(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidRegistrationToken):
			response.Error(c, http.StatusUnauthorized, "invalid_registration_token",
				"This registration session is no longer valid. Start again")
		case errors.Is(err, service.ErrContactTaken):
			response.Error(c, http.StatusConflict, "contact_taken",
				"This phone or email is already registered")
		default:
			logger.Errorf("complete registration: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error",
				"Could not complete registration")
		}
		return
	}

	response.Success(c, http.StatusCreated, "Registration successful", result)
}

// Login handles POST /api/v1/auth/login.
func (h *AuthHandler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	req.Normalize()

	result, err := h.auth.Login(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidCredentials):
			// One message for a wrong password and for an unknown account.
			response.Error(c, http.StatusUnauthorized, "invalid_credentials", "Invalid credentials")
		default:
			logger.Errorf("login: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error", "Could not complete login")
		}
		return
	}

	response.OK(c, "Login successful", result)
}

// Me handles GET /api/v1/auth/me and runs behind the auth middleware.
func (h *AuthHandler) Me(c *gin.Context) {
	// The identity comes from the verified token, never from the request body
	// or a query parameter.
	userID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	user, err := h.auth.CurrentUser(c.Request.Context(), userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrUserNotFound):
			// A valid token for an account that no longer exists.
			response.Error(c, http.StatusUnauthorized, "invalid_token", "Invalid token")
		default:
			logger.Errorf("current user: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error",
				"Could not load the current user")
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
