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

// AdminSessionResponse is returned by a successful sign-in.
type AdminSessionResponse struct {
	Admin       AdminResponse `json:"admin"`
	AccessToken string        `json:"access_token"`
	TokenType   string        `json:"token_type"`
	// ExpiresIn is in seconds, matching the OAuth 2.0 convention clients expect.
	ExpiresIn int64 `json:"expires_in"`
}
