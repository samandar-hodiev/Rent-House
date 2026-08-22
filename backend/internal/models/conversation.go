package models

import (
	"time"

	"github.com/google/uuid"
)

// Conversation is the correspondence between two people.
//
// Identity is the pair — UNIQUE (buyer_id, owner_id) — not the listing. Two
// people who write to each other about three apartments have one conversation,
// because that is what they have: one conversation. The listing is what a
// message is *about*, and lives on the message.
//
// Membership also lives in conversation_participants, which is what every
// authorization check reads and what holds each person's own view of the
// thread. BuyerID and OwnerID name the pair for the uniqueness constraint,
// which only a column on the row itself can carry.
type Conversation struct {
	Base
	// ApartmentID is the thread's current context — the listing most recently
	// written about. Nullable: that listing can be withdrawn while the
	// conversation carries on.
	ApartmentID *uuid.UUID `gorm:"column:apartment_id;type:uuid;index:idx_conversations_apartment_id" json:"apartment_id,omitempty"`

	// The pair. BuyerID opened the thread; OwnerID is the person they wrote to.
	BuyerID uuid.UUID `gorm:"column:buyer_id;type:uuid;not null" json:"buyer_id"`
	OwnerID uuid.UUID `gorm:"column:owner_id;type:uuid;not null" json:"owner_id"`

	// DeletedAt is set when the thread is withdrawn from both sides. Soft, so
	// the removal is a state every read enforces rather than an absence the
	// client has to be trusted to respect.
	DeletedAt *time.Time `gorm:"column:deleted_at" json:"deleted_at,omitempty"`

	Timestamps

	Apartment    *Apartment                `gorm:"foreignKey:ApartmentID;references:ID" json:"apartment,omitempty"`
	Buyer        *User                     `gorm:"foreignKey:BuyerID;references:ID" json:"buyer,omitempty"`
	Participants []ConversationParticipant `gorm:"foreignKey:ConversationID" json:"participants,omitempty"`
	Messages     []Message                 `gorm:"foreignKey:ConversationID" json:"messages,omitempty"`
}

func (Conversation) TableName() string { return "conversations" }
