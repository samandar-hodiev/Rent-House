package models

import (
	"time"

	"github.com/google/uuid"
)

// AdminUserBlock is one occasion on which an administrator blocked a
// marketplace account.
//
// A row per event rather than columns on the account: unblocking closes the row
// by stamping UnblockedAt, so the history survives. The account's current state
// lives in User.Status, which is what the list filters on.
type AdminUserBlock struct {
	ID     uuid.UUID `gorm:"column:id;type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	UserID uuid.UUID `gorm:"column:user_id;type:uuid;not null" json:"user_id"`

	// Nullable because an administrator's account can be removed later, and
	// deleting them must not erase what they did.
	BlockedBy *uuid.UUID `gorm:"column:blocked_by;type:uuid" json:"blocked_by,omitempty"`
	Reason    string     `gorm:"column:reason;type:text;not null" json:"reason"`
	BlockedAt time.Time  `gorm:"column:blocked_at;autoCreateTime" json:"blocked_at"`

	// Null while the block is in force.
	UnblockedAt *time.Time `gorm:"column:unblocked_at" json:"unblocked_at,omitempty"`
	UnblockedBy *uuid.UUID `gorm:"column:unblocked_by;type:uuid" json:"unblocked_by,omitempty"`
}

func (AdminUserBlock) TableName() string { return "admin_user_blocks" }
