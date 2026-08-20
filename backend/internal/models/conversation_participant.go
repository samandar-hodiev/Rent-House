package models

import (
	"time"

	"github.com/google/uuid"
)

// ConversationParticipant places a user in a thread. The pair is the primary
// key, so the same user cannot be added twice.
type ConversationParticipant struct {
	ConversationID uuid.UUID `gorm:"column:conversation_id;type:uuid;primaryKey" json:"conversation_id"`
	UserID         uuid.UUID `gorm:"column:user_id;type:uuid;primaryKey;index:idx_conversation_participants_user_id" json:"user_id"`

	CreatedAt time.Time `gorm:"column:created_at;not null;default:now()" json:"created_at"`

	Conversation *Conversation `gorm:"foreignKey:ConversationID;references:ID" json:"conversation,omitempty"`
	User         *User         `gorm:"foreignKey:UserID;references:ID" json:"user,omitempty"`
}

func (ConversationParticipant) TableName() string { return "conversation_participants" }
