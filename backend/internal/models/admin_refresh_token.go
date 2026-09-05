package models

import (
	"time"

	"github.com/google/uuid"
)

// AdminRefreshToken is the dashboard's half of a session — see RefreshToken
// for the marketplace's, which this mirrors field for field. Kept as its own
// table rather than a shared one because the two are already separate systems
// with separate accounts and separate token audiences.
type AdminRefreshToken struct {
	ID      uuid.UUID `gorm:"column:id;type:uuid;default:gen_random_uuid();primaryKey"`
	AdminID uuid.UUID `gorm:"column:admin_id;type:uuid;not null"`

	TokenHash string `gorm:"column:token_hash;type:char(64);not null"`

	ExpiresAt time.Time `gorm:"column:expires_at;not null"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime"`

	RevokedAt  *time.Time `gorm:"column:revoked_at"`
	ReplacedBy *uuid.UUID `gorm:"column:replaced_by;type:uuid"`
}

func (AdminRefreshToken) TableName() string { return "admin_refresh_tokens" }

// IsUsable reports whether this token may still be exchanged: not revoked, not
// expired.
func (t *AdminRefreshToken) IsUsable(now time.Time) bool {
	return t.RevokedAt == nil && t.ExpiresAt.After(now)
}
