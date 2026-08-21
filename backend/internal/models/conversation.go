package models

import "github.com/google/uuid"

// Conversation is a thread about one apartment.
//
// Membership lives in conversation_participants, so the schema is not limited
// to two people even though today's UI shows a pair. BuyerID is separate from
// that: it names the person who opened the thread, and carries the UNIQUE
// constraint that stops two taps on "Xabar yozish" producing two threads about
// the same listing. The other side is always the apartment's owner.
type Conversation struct {
	Base
	ApartmentID uuid.UUID `gorm:"column:apartment_id;type:uuid;not null;index:idx_conversations_apartment_id" json:"apartment_id"`
	BuyerID     uuid.UUID `gorm:"column:buyer_id;type:uuid;not null" json:"buyer_id"`

	Timestamps

	Apartment    *Apartment                `gorm:"foreignKey:ApartmentID;references:ID" json:"apartment,omitempty"`
	Buyer        *User                     `gorm:"foreignKey:BuyerID;references:ID" json:"buyer,omitempty"`
	Participants []ConversationParticipant `gorm:"foreignKey:ConversationID" json:"participants,omitempty"`
	Messages     []Message                 `gorm:"foreignKey:ConversationID" json:"messages,omitempty"`
}

func (Conversation) TableName() string { return "conversations" }
