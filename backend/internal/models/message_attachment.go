package models

import (
	"time"

	"github.com/google/uuid"
)

// Message kinds. A message is text, or it is one attachment.
const (
	MessageKindText  = "text"
	MessageKindImage = "image"
	MessageKindFile  = "file"
	MessageKindAudio = "audio"
)

// MessageKinds is the accepted set, mirrored by a CHECK in migration 0005.
var MessageKinds = []string{
	MessageKindText, MessageKindImage, MessageKindFile, MessageKindAudio,
}

// MessageAttachment is a file sent in a conversation.
//
// The bytes live in storage, not here: a row records where the file went and
// what it is. StoredPath is what a protected download reads back; URL is what
// the client requests. Both are kept so moving to object storage later changes
// how a URL is produced without changing what reads it.
type MessageAttachment struct {
	Base
	MessageID uuid.UUID `gorm:"column:message_id;type:uuid;not null;index:idx_message_attachments_message" json:"message_id"`

	Kind string `gorm:"column:kind;type:varchar(10);not null" json:"kind"`

	// OriginalName is what the sender called it, shown in the UI. Never used to
	// build a path.
	OriginalName string `gorm:"column:original_name;type:varchar(255);not null" json:"original_name"`
	StoredPath   string `gorm:"column:stored_path;type:text;not null" json:"-"`
	URL          string `gorm:"column:url;type:text;not null" json:"url"`

	MimeType  string `gorm:"column:mime_type;type:varchar(120);not null" json:"mime_type"`
	SizeBytes int64  `gorm:"column:size_bytes;not null" json:"size_bytes"`

	// DurationSeconds is set for audio, where the player needs a length before
	// the file loads. Nil for everything else.
	DurationSeconds *int `gorm:"column:duration_seconds" json:"duration_seconds,omitempty"`

	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`

	Message *Message `gorm:"foreignKey:MessageID;references:ID" json:"message,omitempty"`
}

func (MessageAttachment) TableName() string { return "message_attachments" }
