package models

import (
	"time"

	"github.com/google/uuid"
)

// Who a notification is for. Administrators and marketplace accounts live in
// separate tables, so the recipient is named by audience and id.
const (
	AudienceAdmin = "admin"
	AudienceUser  = "user"
)

// What happened.
//
// The text is not stored — it is rendered from the type and the payload in
// whatever language the reader has chosen. A stored sentence would be frozen in
// the language of the moment it was written, which for a trilingual marketplace
// is the wrong one two times out of three.
const (
	// To administrators.
	NotificationListingPending = "listing_pending"
	NotificationReportCreated  = "report_created"
	NotificationUserRegistered = "user_registered"

	// To the person whose listing it is.
	NotificationListingModerated = "listing_moderated"
)

// What a notification points at, so it can link somewhere.
const (
	NotificationEntityListing = "listing"
	NotificationEntityReport  = "report"
	NotificationEntityUser    = "user"
)

// Notification is one thing somebody should know about.
type Notification struct {
	ID uuid.UUID `gorm:"column:id;type:uuid;default:gen_random_uuid();primaryKey"`

	Audience    string    `gorm:"column:audience;type:varchar(10);not null"`
	RecipientID uuid.UUID `gorm:"column:recipient_id;type:uuid;not null"`

	Type string `gorm:"column:type;type:varchar(40);not null"`
	// Payload carries what the sentence needs — a listing's title, a person's
	// name — as JSON, because the shape differs per type.
	Payload JSONMap `gorm:"column:payload;type:jsonb;not null;default:'{}'"`

	EntityType string     `gorm:"column:entity_type;type:varchar(20);not null;default:''"`
	EntityID   *uuid.UUID `gorm:"column:entity_id;type:uuid"`

	ReadAt    *time.Time `gorm:"column:read_at"`
	CreatedAt time.Time  `gorm:"column:created_at;autoCreateTime"`
}

func (Notification) TableName() string { return "notifications" }
