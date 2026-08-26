package models

import (
	"time"

	"github.com/google/uuid"
)

// Roles an administrator can hold.
//
// Only two, and they are not a hierarchy of many: the owner runs the place and
// everyone else administers it. A finer scheme can be added when there is a
// second thing to distinguish, but inventing one now would mean authorization
// rules nobody has asked for.
const (
	AdminRoleOwner      = "owner"
	AdminRoleSuperAdmin = "super_admin"
)

// Whether an account may sign in, and why not.
//
// `inactive` and `suspended` both refuse the sign-in; they are separate because
// the person is told different things — one reads as "not switched on yet", the
// other as "switched off deliberately".
const (
	AdminStatusActive    = "active"
	AdminStatusInactive  = "inactive"
	AdminStatusSuspended = "suspended"
)

// AdminRoles and AdminStatuses list the accepted values, matching the CHECK
// constraints in migration 0016.
var (
	AdminRoles    = []string{AdminRoleOwner, AdminRoleSuperAdmin}
	AdminStatuses = []string{AdminStatusActive, AdminStatusInactive, AdminStatusSuspended}
)

// Admin is a dashboard account.
//
// Deliberately not a `users` row with a role: administrators are created by the
// owner, never by self-registration, and keeping them in their own table means
// the public registration path physically cannot produce one.
type Admin struct {
	ID    uuid.UUID `gorm:"column:id;type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Name  string    `gorm:"column:name;type:varchar(200);not null" json:"name"`
	Email string    `gorm:"column:email;type:varchar(255);uniqueIndex" json:"email"`

	// Tagged json:"-" so it cannot leave through a handler that marshals an
	// Admin directly. The DTOs build responses field by field as well, so this
	// is the second of two guards rather than the only one.
	PasswordHash string `gorm:"column:password_hash;type:varchar(255);not null" json:"-"`

	Role   string `gorm:"column:role;type:varchar(20);not null" json:"role"`
	Status string `gorm:"column:status;type:varchar(20);not null;default:active" json:"status"`

	CreatedAt   time.Time  `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt   time.Time  `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
	LastLoginAt *time.Time `gorm:"column:last_login_at" json:"last_login_at,omitempty"`
}

func (Admin) TableName() string { return "admins" }

// IsOwner reports whether this account runs the place. Authorization asks this
// rather than comparing role strings at each call site.
func (a *Admin) IsOwner() bool { return a.Role == AdminRoleOwner }

// CanSignIn reports whether the account is in a state that allows a session.
func (a *Admin) CanSignIn() bool { return a.Status == AdminStatusActive }

// AdminSidebarSection is one switch on the owner's sidebar control page.
type AdminSidebarSection struct {
	Section   string    `gorm:"column:section;type:varchar(40);primaryKey" json:"section"`
	Enabled   bool      `gorm:"column:enabled;not null" json:"enabled"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
}

func (AdminSidebarSection) TableName() string { return "admin_sidebar_sections" }
