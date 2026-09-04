package models

import (
	"time"

	"github.com/google/uuid"
)

// RefreshToken is the server's half of a session.
//
// The access token stays stateless and short-lived; this row is what renews it,
// and revoking it is what ends the session for good. Only a digest of the
// secret is held — see the migration for why.
type RefreshToken struct {
	ID     uuid.UUID `gorm:"column:id;type:uuid;default:gen_random_uuid();primaryKey"`
	UserID uuid.UUID `gorm:"column:user_id;type:uuid;not null"`

	TokenHash string `gorm:"column:token_hash;type:char(64);not null"`

	ExpiresAt time.Time `gorm:"column:expires_at;not null"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime"`

	RevokedAt  *time.Time `gorm:"column:revoked_at"`
	ReplacedBy *uuid.UUID `gorm:"column:replaced_by;type:uuid"`
}

func (RefreshToken) TableName() string { return "refresh_tokens" }

// IsUsable reports whether this token may still be exchanged: not revoked, not
// expired. Both are checked here rather than in three query builders.
func (t *RefreshToken) IsUsable(now time.Time) bool {
	return t.RevokedAt == nil && t.ExpiresAt.After(now)
}
