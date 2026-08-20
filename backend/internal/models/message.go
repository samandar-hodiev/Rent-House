package models

import "github.com/google/uuid"

// Message is one chat message in a conversation.
type Message struct {
	Base
	ConversationID uuid.UUID `gorm:"column:conversation_id;type:uuid;not null;index:idx_messages_conversation_created,priority:1" json:"conversation_id"`
	SenderID       uuid.UUID `gorm:"column:sender_id;type:uuid;not null;index:idx_messages_sender_id" json:"sender_id"`

	Body   string `gorm:"column:body;type:text;not null" json:"body"`
	IsRead bool   `gorm:"column:is_read;not null;default:false" json:"is_read"`

	Timestamps

	Conversation *Conversation `gorm:"foreignKey:ConversationID;references:ID" json:"conversation,omitempty"`
	Sender       *User         `gorm:"foreignKey:SenderID;references:ID" json:"sender,omitempty"`
}

func (Message) TableName() string { return "messages" }
