// Package handler holds the HTTP layer: bind, delegate, respond. No business
// rules and no database access live here.
package handler

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

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
	// Where the frontend lives, for the link in a password-reset email. Taken
	// from configuration rather than from the request: a `Host` header is the
	// caller's to set, and building a reset link from it would let somebody
	// send a real token to a domain of their choosing.
	appOrigin string
}

func NewAuthHandler(auth *service.AuthService, appOrigin string) *AuthHandler {
	return &AuthHandler{auth: auth, appOrigin: strings.TrimRight(appOrigin, "/")}
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
		// Switched off for the whole marketplace rather than refused for this
		// caller: 403 with a code the sign-up form turns into an explanation.
		case errors.Is(err, service.ErrRegistrationClosed):
			response.Error(c, http.StatusForbidden, "registration_closed",
				"Registration is currently closed")
		case errors.Is(err, service.ErrMethodDisabled):
			response.Error(c, http.StatusForbidden, "method_disabled",
				"That way of registering is currently unavailable")
		case errors.Is(err, service.ErrContactBlocked):
			response.Error(c, http.StatusForbidden, "contact_blocked",
				"This contact belongs to a blocked account")
		case errors.Is(err, service.ErrContactTaken):
			response.Error(c, http.StatusConflict, "contact_taken",
				"This phone or email is already registered")
		case errors.Is(err, service.ErrResendTooSoon):
			response.Error(c, http.StatusTooManyRequests, "otp_cooldown",
				"Please wait before requesting another code")
		case errors.Is(err, service.ErrDeliveryFailed):
			// A distinct code: the request reached the server and was
			// understood; the provider is what failed. Retrying may work.
			response.Error(c, http.StatusBadGateway, "otp_delivery_failed",
				"Could not deliver the verification code. Please try again shortly")
		default:
			logger.Errorf("request registration code: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error",
				"Could not send the verification code")
		}
		return
	}

	// The message matches what actually happened. In development nothing was
	// delivered, and saying otherwise here would be the same lie the UI is
	// forbidden from telling.
	message := "Verification code sent"
	if result.Delivery == dto.DeliveryLogged {
		message = "Development mode: the code was written to the server log, not sent"
	}
	response.OK(c, message, result)
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
			response.Error(c, http.StatusUnprocessableEntity, "otp_expired",
				"The verification code has expired")
		case errors.Is(err, service.ErrTooManyAttempts):
			response.Error(c, http.StatusTooManyRequests, "otp_attempts_exceeded",
				"Too many incorrect attempts. Request a new code")
		case errors.Is(err, service.ErrInvalidCode):
			response.Error(c, http.StatusUnprocessableEntity, "invalid_otp",
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
		case errors.Is(err, service.ErrWeakPassword):
			// The message names the rule the configured policy applied.
			response.Error(c, http.StatusBadRequest, "weak_password", err.Error())
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
		case errors.Is(err, service.ErrAccountLocked):
			// 429: the credentials were not judged at all, the caller is being
			// asked to wait. The message carries the wait.
			response.Error(c, http.StatusTooManyRequests, "account_locked", err.Error())
		case errors.Is(err, service.ErrAccountBlocked):
			// Said plainly: the password was right, and the person needs to
			// know why they still cannot get in.
			response.Error(c, http.StatusForbidden, "account_blocked",
				"This account has been blocked")
		default:
			logger.Errorf("login: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error", "Could not complete login")
		}
		return
	}

	response.OK(c, "Login successful", result)
}

// ForgotPassword handles POST /api/v1/auth/password/forgot.
//
// Always answers the same way. Whether the address belongs to an account is
// exactly what an attacker would use this endpoint to find out, so the response
// says only that a link will be sent if it does.
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req dto.ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	req.Normalize()

	// The link points at the frontend, whose address the API knows from the
	// origins it is configured to accept — the same list CORS uses, so there is
	// one answer to "where does the app live" rather than two.
	err := h.auth.RequestPasswordReset(c.Request.Context(), req.Email, func(token string) string {
		return fmt.Sprintf("%s/reset-password?token=%s", h.appOrigin, url.QueryEscape(token))
	})
	if err != nil && !errors.Is(err, service.ErrDeliveryFailed) {
		logger.Errorf("password reset request: %v", err)
	}

	// Even a delivery failure answers the same way: reporting it would say the
	// address exists.
	response.OK(c, "If that email belongs to a RentHouse account, a reset link has been sent", nil)
}

// ValidateResetToken handles GET /api/v1/auth/password/reset?token=…
//
// So the page can show the form or the "this link has expired" state, rather
// than a form that fails the moment it is submitted.
func (h *AuthHandler) ValidateResetToken(c *gin.Context) {
	if err := h.auth.ValidateResetToken(c.Request.Context(), c.Query("token")); err != nil {
		if errors.Is(err, service.ErrInvalidResetToken) {
			response.Error(c, http.StatusBadRequest, "invalid_token",
				"This password reset link is invalid or has expired")
			return
		}
		logger.Errorf("validate reset token: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return
	}
	response.OK(c, "Token is valid", nil)
}

// ResetPassword handles POST /api/v1/auth/password/reset.
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req dto.ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}

	if err := h.auth.ResetPassword(c.Request.Context(), req.Token, req.Password); err != nil {
		if errors.Is(err, service.ErrInvalidResetToken) {
			response.Error(c, http.StatusBadRequest, "invalid_token",
				"This password reset link is invalid or has expired")
			return
		}
		logger.Errorf("reset password: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not update the password")
		return
	}

	response.OK(c, "Password updated", nil)
}

// UpdateProfile handles PATCH /api/v1/me.
//
// The account edited is the one the token names. There is no id in the path or
// the body, so this cannot be aimed at anyone else.
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	var req dto.UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	req.Normalize()

	user, err := h.auth.UpdateProfile(c.Request.Context(), userID, req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrUserNotFound):
			response.Error(c, http.StatusUnauthorized, "invalid_token", "Invalid token")
		case errors.Is(err, service.ErrProfileEditDisabled):
			response.Error(c, http.StatusForbidden, "profile_edit_disabled",
				"Editing a profile is currently switched off")
		case errors.Is(err, service.ErrAvatarRequired):
			response.Error(c, http.StatusBadRequest, "avatar_required",
				"This marketplace requires a profile picture")
		case errors.Is(err, service.ErrNameRequired):
			response.Error(c, http.StatusBadRequest, "validation_failed",
				"First name and last name cannot be empty")
		case errors.Is(err, service.ErrInvalidPhone):
			response.Error(c, http.StatusBadRequest, "invalid_phone",
				"Enter a valid Uzbek mobile number")
		case errors.Is(err, service.ErrContactRequired):
			response.Error(c, http.StatusBadRequest, "contact_required",
				"An account needs a phone number or an email")
		case errors.Is(err, service.ErrPhoneTaken):
			// Reported openly, like registration does: the person needs to know
			// the number is in use, and the same fact is already discoverable
			// from the sign-in form.
			response.Error(c, http.StatusConflict, "phone_taken",
				"That phone number already belongs to another account")
		case errors.Is(err, service.ErrInvalidAvatar):
			response.Error(c, http.StatusBadRequest, "invalid_avatar",
				"Upload the image first, then save the profile")
		default:
			logger.Errorf("update profile: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error",
				"Could not save the profile")
		}
		return
	}

	response.OK(c, "Profile updated", user)
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
