package models

import (
	"time"

	"github.com/google/uuid"
)

// ConversationParticipant places a user in a thread, and holds what that one
// person thinks of it.
//
// The pair is the primary key, so the same user cannot be added twice — and,
// more usefully here, so one person's pin, archive or deletion has nowhere to
// touch anybody else's. There is no shared column for it to leak through.
type ConversationParticipant struct {
	ConversationID uuid.UUID `gorm:"column:conversation_id;type:uuid;primaryKey" json:"conversation_id"`
	UserID         uuid.UUID `gorm:"column:user_id;type:uuid;primaryKey;index:idx_conversation_participants_user_id" json:"user_id"`

	// Timestamps rather than booleans: "when did you pin this" orders the
	// pinned group, and "when did you delete this" is the cutoff deciding which
	// messages are still this user's to read and whether a later message brings
	// the thread back.
	PinnedAt   *time.Time `gorm:"column:pinned_at" json:"pinned_at,omitempty"`
	ArchivedAt *time.Time `gorm:"column:archived_at" json:"archived_at,omitempty"`
	DeletedAt  *time.Time `gorm:"column:deleted_at" json:"deleted_at,omitempty"`

	CreatedAt time.Time `gorm:"column:created_at;not null;default:now()" json:"created_at"`

	Conversation *Conversation `gorm:"foreignKey:ConversationID;references:ID" json:"conversation,omitempty"`
	User         *User         `gorm:"foreignKey:UserID;references:ID" json:"user,omitempty"`
}

func (ConversationParticipant) TableName() string { return "conversation_participants" }
