package models

import (
	"time"

	"github.com/google/uuid"
)

// Actions the dashboard records. A closed set, named here so a typo in a
// handler cannot invent a new kind of entry.
const (
	AuditSignIn         = "sign_in"
	AuditSignInFailed   = "sign_in_failed"
	AuditAdminCreated   = "admin_created"
	AuditAdminDeleted   = "admin_deleted"
	AuditAdminStatus    = "admin_status_changed"
	AuditUserBlocked    = "user_blocked"
	AuditUserUnblocked  = "user_unblocked"
	AuditSidebarChanged = "sidebar_changed"
	AuditProfileUpdated = "profile_updated"
)

// Outcomes an entry can record.
const (
	AuditSuccess = "success"
	AuditFailed  = "failed"
)

// AdminAuditLog is one thing an administrator did.
//
// The administrator's name is stored alongside the id rather than only joined:
// an account can be removed later, and the record of what it did must survive
// that. The id becomes null; the name stays.
type AdminAuditLog struct {
	ID        uuid.UUID  `gorm:"column:id;type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	AdminID   *uuid.UUID `gorm:"column:admin_id;type:uuid" json:"admin_id,omitempty"`
	AdminName string     `gorm:"column:admin_name;type:varchar(200);not null" json:"admin_name"`

	Action string `gorm:"column:action;type:varchar(60);not null" json:"action"`
	Target string `gorm:"column:target;type:varchar(300);not null" json:"target"`
	IP     string `gorm:"column:ip;type:varchar(64);not null" json:"ip"`
	Status string `gorm:"column:status;type:varchar(20);not null" json:"status"`

	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`
}

func (AdminAuditLog) TableName() string { return "admin_audit_logs" }
