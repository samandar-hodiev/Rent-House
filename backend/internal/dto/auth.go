// Package dto holds the request and response shapes the API speaks.
//
// HTTP requests are never bound straight into a model: doing so would let a
// client set fields it has no business setting — password_hash, id, timestamps.
// Responses are built explicitly for the same reason, so a field added to a
// model later cannot leak by accident.
package dto

import (
	"strings"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// RegisterRequestOTP is the body of POST /api/v1/auth/register/request — step
// one, which asks for a code to be sent.
//
// Exactly one contact is expected, matching `method`; the service rejects a
// request that supplies the wrong one.
type RegisterRequestOTP struct {
	Method string `json:"method" binding:"required,oneof=phone email"`
	Phone  string `json:"phone"  binding:"omitempty,uzphone"`
	Email  string `json:"email"  binding:"omitempty,email,max=255"`
}

// Normalize applies the canonical form of each contact. Email casing must not
// create two accounts for one address.
func (r *RegisterRequestOTP) Normalize() {
	r.Method = strings.ToLower(strings.TrimSpace(r.Method))
	r.Email = strings.ToLower(strings.TrimSpace(r.Email))
	r.Phone = NormalizeUzPhone(r.Phone)
}

// Contact returns the destination implied by the method.
func (r *RegisterRequestOTP) Contact() string {
	if r.Method == models.VerificationMethodPhone {
		return r.Phone
	}
	return r.Email
}

// RegisterRequestOTPResponse is returned by step one.
//
// It carries no code: the whole point is that the code travels by SMS or email,
// proving the caller controls that contact.
type RegisterRequestOTPResponse struct {
	VerificationID string `json:"verification_id"`
	Method         string `json:"method"`
	// ExpiresIn is in seconds, so the client can run its countdown.
	ExpiresIn         int64 `json:"expires_in"`
	ResendAfter       int64 `json:"resend_after"`
	AttemptsRemaining int   `json:"attempts_remaining"`
}

// VerifyOTPRequest is the body of POST /api/v1/auth/register/verify.
type VerifyOTPRequest struct {
	VerificationID string `json:"verification_id" binding:"required,uuid"`
	Code           string `json:"code"            binding:"required,len=6,numeric"`
}

func (r *VerifyOTPRequest) Normalize() {
	r.VerificationID = strings.TrimSpace(r.VerificationID)
	r.Code = strings.TrimSpace(r.Code)
}

// VerifyOTPResponse hands back the short-lived token that step three exchanges
// for an account.
type VerifyOTPResponse struct {
	RegistrationToken string `json:"registration_token"`
	ExpiresIn         int64  `json:"expires_in"`
}

// CompleteRegistrationRequest is the body of POST /api/v1/auth/register/complete.
//
// It carries no email or phone: the contact comes from the verified session, so
// a caller cannot verify one number and register another.
type CompleteRegistrationRequest struct {
	RegistrationToken string `json:"registration_token" binding:"required"`
	FirstName         string `json:"first_name"         binding:"required,min=2,max=100"`
	LastName          string `json:"last_name"          binding:"required,min=2,max=100"`
	// bcrypt ignores anything past 72 bytes, so a longer password would be
	// silently truncated. Rejecting it is honest; no complexity rules beyond a
	// sensible minimum length.
	Password             string `json:"password"              binding:"required,min=8,max=72"`
	PasswordConfirmation string `json:"password_confirmation" binding:"required,eqfield=Password"`
	Language             string `json:"language"              binding:"omitempty,oneof=uz ru en"`
}

func (r *CompleteRegistrationRequest) Normalize() {
	r.RegistrationToken = strings.TrimSpace(r.RegistrationToken)
	r.FirstName = strings.TrimSpace(r.FirstName)
	r.LastName = strings.TrimSpace(r.LastName)
	if r.Language == "" {
		r.Language = models.LanguageUz
	}
}

// LoginRequest is the body of POST /api/v1/auth/login. The identifier is an
// email or a phone number; the service works out which.
type LoginRequest struct {
	Identifier string `json:"identifier" binding:"required"`
	Password   string `json:"password"   binding:"required"`
}

// Normalize trims the identifier, lowercases it when it looks like an email,
// and canonicalises it when it looks like a phone number, so login matches what
// registration stored.
func (r *LoginRequest) Normalize() {
	r.Identifier = strings.TrimSpace(r.Identifier)
	if strings.Contains(r.Identifier, "@") {
		r.Identifier = strings.ToLower(r.Identifier)
		return
	}
	if normalized := NormalizeUzPhone(r.Identifier); normalized != "" {
		r.Identifier = normalized
	}
}

// UserResponse is the public view of a user. It has no password field of any
// kind, which is what makes it safe to return.
type UserResponse struct {
	ID        string  `json:"id"`
	FirstName string  `json:"first_name"`
	LastName  string  `json:"last_name"`
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	AvatarURL *string `json:"avatar_url"`
	Language  string  `json:"language"`
	Theme     string  `json:"theme"`
}

// NewUserResponse copies the fields a client may see. Anything not listed here
// — the password hash above all — cannot reach a response.
func NewUserResponse(user *models.User) UserResponse {
	return UserResponse{
		ID:        user.ID.String(),
		FirstName: user.FirstName,
		LastName:  user.LastName,
		Email:     user.Email,
		Phone:     user.Phone,
		AvatarURL: user.AvatarURL,
		Language:  user.Language,
		Theme:     user.Theme,
	}
}

// AuthResponse is returned by a completed registration and by login.
type AuthResponse struct {
	User        UserResponse `json:"user"`
	AccessToken string       `json:"access_token"`
	TokenType   string       `json:"token_type"`
	// ExpiresIn is in seconds, matching the OAuth 2.0 convention clients expect.
	ExpiresIn int64 `json:"expires_in"`
}
