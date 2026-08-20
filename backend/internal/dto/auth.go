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

// RegisterRequest is the body of POST /api/v1/auth/register.
//
// There is no password_hash field, and no id, theme or avatar: registration
// decides those, not the caller.
type RegisterRequest struct {
	FirstName string `json:"first_name" binding:"required,min=2,max=100"`
	LastName  string `json:"last_name"  binding:"required,min=2,max=100"`
	Email     string `json:"email"      binding:"required,email,max=255"`
	Phone     string `json:"phone"      binding:"required,uzphone"`
	// bcrypt ignores anything past 72 bytes, so a longer password would be
	// silently truncated. Rejecting it is honest; complexity rules are not
	// imposed beyond a sensible minimum length.
	Password string `json:"password" binding:"required,min=8,max=72"`
	Language string `json:"language" binding:"omitempty,oneof=uz ru en"`
}

// Normalize applies the canonical form of each field before it is stored or
// compared. Email casing must not create two accounts for one address.
func (r *RegisterRequest) Normalize() {
	r.FirstName = strings.TrimSpace(r.FirstName)
	r.LastName = strings.TrimSpace(r.LastName)
	r.Email = strings.ToLower(strings.TrimSpace(r.Email))
	r.Phone = strings.TrimSpace(r.Phone)
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

// Normalize trims the identifier and lowercases it when it looks like an email,
// so login matches the casing registration stored.
func (r *LoginRequest) Normalize() {
	r.Identifier = strings.TrimSpace(r.Identifier)
	if strings.Contains(r.Identifier, "@") {
		r.Identifier = strings.ToLower(r.Identifier)
	}
}

// UserResponse is the public view of a user. It has no password field of any
// kind, which is what makes it safe to return.
type UserResponse struct {
	ID        string  `json:"id"`
	FirstName string  `json:"first_name"`
	LastName  string  `json:"last_name"`
	Email     string  `json:"email"`
	Phone     string  `json:"phone"`
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

// AuthResponse is returned by register and login.
type AuthResponse struct {
	User        UserResponse `json:"user"`
	AccessToken string       `json:"access_token"`
	TokenType   string       `json:"token_type"`
	// ExpiresIn is in seconds, matching the OAuth 2.0 convention clients expect.
	ExpiresIn int64 `json:"expires_in"`
}
