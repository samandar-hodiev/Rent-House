package models

import "github.com/google/uuid"

// ApartmentImage is one photo of a listing. Photos live in their own table
// rather than as a JSON blob or delimited string on Apartment, so they can be
// ordered, counted and replaced individually.
type ApartmentImage struct {
	Base
	ApartmentID uuid.UUID `gorm:"column:apartment_id;type:uuid;not null;index:idx_apartment_images_apartment_id" json:"apartment_id"`

	URL string `gorm:"column:url;type:text;not null" json:"url"`

	// IsPrimary marks the cover photo. A partial unique index in the migration
	// allows only one primary row per apartment.
	IsPrimary bool  `gorm:"column:is_primary;not null;default:false" json:"is_primary"`
	SortOrder int16 `gorm:"column:sort_order;not null;default:0" json:"sort_order"`

	Timestamps

	Apartment *Apartment `gorm:"foreignKey:ApartmentID;references:ID" json:"apartment,omitempty"`
}

func (ApartmentImage) TableName() string { return "apartment_images" }
