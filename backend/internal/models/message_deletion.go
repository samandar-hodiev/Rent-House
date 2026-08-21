package models

import (
	"time"

	"github.com/google/uuid"
)

// MessageDeletion hides one message from one participant.
//
// "Delete for me" is a property of the pair, not of the message, so it cannot
// live on the message row: the same message is gone for one reader and present
// for the other. A row here means this user does not see that message.
type MessageDeletion struct {
	MessageID uuid.UUID `gorm:"column:message_id;type:uuid;primaryKey" json:"message_id"`
	UserID    uuid.UUID `gorm:"column:user_id;type:uuid;primaryKey;index:idx_message_deletions_user" json:"user_id"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`

	Message *Message `gorm:"foreignKey:MessageID;references:ID" json:"message,omitempty"`
	User    *User    `gorm:"foreignKey:UserID;references:ID" json:"user,omitempty"`
}

func (MessageDeletion) TableName() string { return "message_deletions" }
