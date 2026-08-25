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

// Delivery modes reported by the register-request endpoint.
const (
	// DeliverySent means a real provider accepted the message.
	DeliverySent = "sent"
	// DeliveryLogged means the server is in development mode: the code was
	// written to the server log and nothing was delivered.
	DeliveryLogged = "logged"
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
	// Delivery is "sent" when a real provider accepted the message, or
	// "logged" when the server is in development mode and only wrote the code
	// to its log. The client must not claim a code was sent unless this is
	// "sent".
	Delivery string `json:"delivery"`
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

// UpdateProfileRequest is the body of PATCH /api/v1/me.
//
// Every field is a pointer so "not sent" and "sent empty" are different things:
// omitting `phone` leaves it alone, sending "" clears it. A struct of plain
// strings could not tell those apart, and a profile form that leaves a field
// untouched must not erase it.
type UpdateProfileRequest struct {
	FirstName *string `json:"first_name" binding:"omitempty,min=1,max=100"`
	LastName  *string `json:"last_name"  binding:"omitempty,min=1,max=100"`
	// Free-form rather than a strict pattern: numbers are entered with spaces,
	// brackets and a leading +, and the service normalizes before storing.
	Phone *string `json:"phone" binding:"omitempty,max=32"`
	// A path produced by the upload endpoint, not an arbitrary URL — checked in
	// the service, because an image the client names could otherwise point
	// anywhere and every viewer's browser would fetch it.
	AvatarURL *string `json:"avatar_url" binding:"omitempty,max=512"`
}

// Normalize trims what the person typed. Names keep their inner spacing;
// only the edges go.
func (r *UpdateProfileRequest) Normalize() {
	if r.FirstName != nil {
		trimmed := strings.TrimSpace(*r.FirstName)
		r.FirstName = &trimmed
	}
	if r.LastName != nil {
		trimmed := strings.TrimSpace(*r.LastName)
		r.LastName = &trimmed
	}
	// Put through the same normalizer registration uses, so one account cannot
	// hold "+998 90 123 45 67" while another holds "998901234567" and the
	// unique constraint treats them as different people.
	//
	// A number the normalizer cannot read keeps the text as typed rather than
	// becoming "". Empty means "remove my phone number", so collapsing an
	// unreadable one into it would turn a typo into a deletion — the service
	// rejects the raw text instead, which is what a typo deserves.
	if r.Phone != nil && *r.Phone != "" {
		if normalized := NormalizeUzPhone(*r.Phone); normalized != "" {
			r.Phone = &normalized
		}
	}
	if r.AvatarURL != nil {
		trimmed := strings.TrimSpace(*r.AvatarURL)
		r.AvatarURL = &trimmed
	}
}

// ForgotPasswordRequest is the body of POST /api/v1/auth/password/forgot.
type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email,max=255"`
}

func (r *ForgotPasswordRequest) Normalize() {
	r.Email = strings.ToLower(strings.TrimSpace(r.Email))
}

// ResetPasswordRequest is the body of POST /api/v1/auth/password/reset.
//
// The same minimum the registration form enforces, so an account cannot end up
// with a password weaker than one it could have been created with.
type ResetPasswordRequest struct {
	Token    string `json:"token"    binding:"required"`
	Password string `json:"password" binding:"required,min=8,max=72"`
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
