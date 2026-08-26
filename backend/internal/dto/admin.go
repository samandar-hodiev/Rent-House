package dto

import (
	"strings"
	"time"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// AdminLoginRequest is the body of POST /api/v1/admin/auth/login.
type AdminLoginRequest struct {
	Email    string `json:"email"    binding:"required,email,max=255"`
	Password string `json:"password" binding:"required,min=1,max=72"`
}

func (r *AdminLoginRequest) Normalize() {
	r.Email = strings.ToLower(strings.TrimSpace(r.Email))
}

// CreateAdminRequest is the body of POST /api/v1/admin/admins.
//
// The role is accepted rather than assumed so the client says what it means and
// the server checks it — the service refuses anything but `super_admin`, which
// is where "no second owner" is enforced rather than here.
type CreateAdminRequest struct {
	Name  string `json:"name"  binding:"required,min=2,max=200"`
	Email string `json:"email" binding:"required,email,max=255"`
	Role  string `json:"role"  binding:"required,oneof=super_admin"`
	// bcrypt ignores anything past 72 bytes, so a longer password would be
	// silently truncated. The minimum matches the marketplace's.
	Password string `json:"password" binding:"required,min=8,max=72"`
}

func (r *CreateAdminRequest) Normalize() {
	r.Name = strings.TrimSpace(r.Name)
	r.Email = strings.ToLower(strings.TrimSpace(r.Email))
}

// UpdateAdminStatusRequest is the body of PATCH /api/v1/admin/admins/:id/status.
type UpdateAdminStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=active inactive suspended"`
}

// UpdateSidebarRequest is the body of PUT /api/v1/admin/sidebar.
type UpdateSidebarRequest struct {
	Sections map[string]bool `json:"sections" binding:"required"`
}

// AdminResponse is the public view of an administrator. It has no password
// field of any kind, which is what makes it safe to return.
type AdminResponse struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Email       string     `json:"email"`
	AvatarURL   *string    `json:"avatar_url"`
	Role        string     `json:"role"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

// NewAdminResponse copies the fields a client may see. Anything not listed here
// — the password hash above all — cannot reach a response.
func NewAdminResponse(admin *models.Admin) AdminResponse {
	return AdminResponse{
		ID:          admin.ID.String(),
		Name:        admin.Name,
		Email:       admin.Email,
		AvatarURL:   admin.AvatarURL,
		Role:        admin.Role,
		Status:      admin.Status,
		CreatedAt:   admin.CreatedAt,
		LastLoginAt: admin.LastLoginAt,
	}
}

// NewAdminResponses maps a list.
func NewAdminResponses(admins []models.Admin) []AdminResponse {
	out := make([]AdminResponse, 0, len(admins))
	for i := range admins {
		out = append(out, NewAdminResponse(&admins[i]))
	}
	return out
}

// UpdateAdminProfileRequest is the body of PATCH /api/v1/admin/profile.
//
// Name and picture only. Role and status are deliberately absent: an
// administrator editing their own profile must not be able to promote
// themselves, and a field that is never read cannot be exploited.
type UpdateAdminProfileRequest struct {
	Name string `json:"name" binding:"required,min=2,max=200"`
	// A path produced by the upload endpoint, not an arbitrary URL — checked in
	// the handler, because an image the client names could otherwise point
	// anywhere and every viewer's browser would fetch it.
	AvatarURL *string `json:"avatar_url" binding:"omitempty,max=512"`
}

func (r *UpdateAdminProfileRequest) Normalize() {
	r.Name = strings.TrimSpace(r.Name)
	if r.AvatarURL != nil {
		trimmed := strings.TrimSpace(*r.AvatarURL)
		r.AvatarURL = &trimmed
	}
}

// UpdateUserStatusRequest is the body of PATCH /api/v1/admin/users/:id/status.
type UpdateUserStatusRequest struct {
	Status string `json:"status" binding:"required,oneof=active blocked"`
}

// AdminUserResponse is a marketplace account as the administrator's table shows
// it. Built field by field, like every other response, so a column added to the
// model later cannot leak.
type AdminUserResponse struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Email        *string   `json:"email"`
	Phone        *string   `json:"phone"`
	AvatarURL    *string   `json:"avatar_url"`
	Status       string    `json:"status"`
	Listings     int64     `json:"listings"`
	RegisteredAt time.Time `json:"registered_at"`
}

// NewAdminUserResponse maps one row. The password hash has no field to land in.
func NewAdminUserResponse(user *models.User, listings int64) AdminUserResponse {
	return AdminUserResponse{
		ID:           user.ID.String(),
		Name:         strings.TrimSpace(user.FirstName + " " + user.LastName),
		Email:        user.Email,
		Phone:        user.Phone,
		AvatarURL:    user.AvatarURL,
		Status:       user.Status,
		Listings:     listings,
		RegisteredAt: user.CreatedAt,
	}
}

// AdminUserListResponse is one page, with what a paginator needs to draw
// itself. Total pages is computed here rather than by the client, so every
// client agrees on where the last page is.
type AdminUserListResponse struct {
	Users      []AdminUserResponse `json:"users"`
	Total      int64               `json:"total"`
	Page       int                 `json:"page"`
	Limit      int                 `json:"limit"`
	TotalPages int                 `json:"total_pages"`
}

// AdminSessionResponse is returned by a successful sign-in.
type AdminSessionResponse struct {
	Admin       AdminResponse `json:"admin"`
	AccessToken string        `json:"access_token"`
	TokenType   string        `json:"token_type"`
	// ExpiresIn is in seconds, matching the OAuth 2.0 convention clients expect.
	ExpiresIn int64 `json:"expires_in"`
}
