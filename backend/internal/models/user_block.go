package models

import (
	"time"

	"github.com/google/uuid"
)

// Reasons a block can name. A closed set so the column holds something worth
// aggregating later rather than free text in six spellings; `BlockReasonOther`
// is what carries the cases the list does not cover, alongside ReasonText.
const (
	BlockReasonSpam       = "spam"
	BlockReasonFakeInfo   = "fake_listing"
	BlockReasonHarassment = "harassment"
	BlockReasonAbuse      = "abuse"
	BlockReasonSuspicious = "suspicious"
	BlockReasonOther      = "other"
)

// BlockReasons is the accepted set, mirrored by the request's binding tag.
var BlockReasons = []string{
	BlockReasonSpam, BlockReasonFakeInfo, BlockReasonHarassment,
	BlockReasonAbuse, BlockReasonSuspicious, BlockReasonOther,
}

// UserBlock is one person refusing to hear from another.
//
// The row is one-directional — it names who did the blocking, and only they can
// undo it — while its effect is mutual: neither side can write to the other.
// A block that only stopped incoming messages would leave the blocker writing
// to someone unable to answer.
type UserBlock struct {
	Base
	BlockerID uuid.UUID `gorm:"column:blocker_id;type:uuid;not null;uniqueIndex:uq_user_blocks_pair,priority:1" json:"blocker_id"`
	BlockedID uuid.UUID `gorm:"column:blocked_id;type:uuid;not null;uniqueIndex:uq_user_blocks_pair,priority:2;index:idx_user_blocks_blocked" json:"blocked_id"`

	// Both optional: blocking someone must not require explaining yourself.
	Reason     *string `gorm:"column:reason;type:varchar(30)" json:"reason,omitempty"`
	ReasonText *string `gorm:"column:reason_text;type:text" json:"reason_text,omitempty"`

	CreatedAt time.Time `gorm:"column:created_at;not null;default:now()" json:"created_at"`

	Blocker *User `gorm:"foreignKey:BlockerID;references:ID" json:"blocker,omitempty"`
	Blocked *User `gorm:"foreignKey:BlockedID;references:ID" json:"blocked,omitempty"`
}

func (UserBlock) TableName() string { return "user_blocks" }
