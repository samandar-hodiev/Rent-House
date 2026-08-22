package models

import (
	"time"

	"github.com/google/uuid"
)

// Tashkent, where RentHouse is used. Fixed at UTC+5 all year — Uzbekistan has
// not observed daylight saving since 1991.
//
// Timestamps are stored in UTC, as timestamptz always is; this is the zone they
// are converted to before a view is filed under a calendar day. Without it a
// view at 23:30 local time lands at 18:30 UTC — still the same day here, but a
// view at 02:00 local is 21:00 UTC the *previous* day, and every late-evening
// reader would be counted against yesterday.
const TashkentZone = "Asia/Tashkent"

// ViewDedupeWindow is how long one visitor's repeat visits to the same listing
// collapse into a single view.
//
// Someone refreshing the page, opening it in a second tab, or coming back from
// the map is one interested person. An hour is long enough to absorb that and
// short enough that returning tomorrow — genuinely a second visit — counts
// again. Enforced by a unique index on the hour bucket, not by a check in Go.
const ViewDedupeWindow = time.Hour

// ApartmentView is one counted view of a listing.
//
// The row is the analytics record; `apartments.views_count` is a running total
// kept alongside it for the cards, which need a number and not a history.
type ApartmentView struct {
	Base
	ApartmentID uuid.UUID `gorm:"column:apartment_id;type:uuid;not null" json:"apartment_id"`

	// ViewerID is nil for a signed-out visitor. Their view still counts; only
	// the link to an account is missing.
	ViewerID *uuid.UUID `gorm:"column:viewer_id;type:uuid" json:"viewer_id,omitempty"`

	// ViewerKey identifies the viewer for deduplication only — the user's id
	// when signed in, otherwise a salted hash of address and user agent. It is
	// never shown and never reversed to an address.
	ViewerKey string `gorm:"column:viewer_key;type:varchar(80);not null" json:"-"`

	// ViewBucket is the local hour this view falls in. Part of the unique index
	// that makes deduplication a property of the schema.
	ViewBucket time.Time `gorm:"column:view_bucket;not null" json:"-"`

	ViewedAt  time.Time `gorm:"column:viewed_at;not null" json:"viewed_at"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime" json:"created_at"`

	Apartment *Apartment `gorm:"foreignKey:ApartmentID;references:ID" json:"apartment,omitempty"`
}

func (ApartmentView) TableName() string { return "apartment_views" }
