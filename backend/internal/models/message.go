package models

import (
	"time"

	"github.com/google/uuid"
)

// Message is one chat message in a conversation.
//
// Withdrawing a message is a soft delete: the row stays so the thread keeps its
// shape and both sides see "this message was deleted" where it stood, rather
// than a gap that reads as a bug. Hiding a message from one side only is a
// property of the pair and lives in message_deletions.
type Message struct {
	Base
	ConversationID uuid.UUID `gorm:"column:conversation_id;type:uuid;not null;index:idx_messages_conversation_created,priority:1" json:"conversation_id"`
	SenderID       uuid.UUID `gorm:"column:sender_id;type:uuid;not null;index:idx_messages_sender_id" json:"sender_id"`

	Body   string `gorm:"column:body;type:text;not null" json:"body"`
	IsRead bool   `gorm:"column:is_read;not null;default:false" json:"is_read"`

	// Set the first time the author changes the text; the UI shows "edited"
	// from its presence.
	EditedAt *time.Time `gorm:"column:edited_at" json:"edited_at,omitempty"`
	// Set by "delete for everyone". A deleted message keeps its row and loses
	// its body in the response.
	DeletedAt *time.Time `gorm:"column:deleted_at" json:"deleted_at,omitempty"`
	// When the recipient opened the thread. IsRead carries the flag and is
	// indexed; this carries the moment a receipt displays.
	ReadAt *time.Time `gorm:"column:read_at" json:"read_at,omitempty"`

	Timestamps

	Conversation *Conversation `gorm:"foreignKey:ConversationID;references:ID" json:"conversation,omitempty"`
	Sender       *User         `gorm:"foreignKey:SenderID;references:ID" json:"sender,omitempty"`
}

func (Message) TableName() string { return "messages" }
