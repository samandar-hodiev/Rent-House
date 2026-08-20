package models

import "github.com/google/uuid"

// Conversation is a thread about one apartment.
//
// It holds no sender or receiver column: participants live in
// conversation_participants, so the schema is not limited to two people even
// though today's UI shows a pair.
type Conversation struct {
	Base
	ApartmentID uuid.UUID `gorm:"column:apartment_id;type:uuid;not null;index:idx_conversations_apartment_id" json:"apartment_id"`

	Timestamps

	Apartment    *Apartment                `gorm:"foreignKey:ApartmentID;references:ID" json:"apartment,omitempty"`
	Participants []ConversationParticipant `gorm:"foreignKey:ConversationID" json:"participants,omitempty"`
	Messages     []Message                 `gorm:"foreignKey:ConversationID" json:"messages,omitempty"`
}

func (Conversation) TableName() string { return "conversations" }
