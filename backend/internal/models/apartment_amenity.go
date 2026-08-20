package models

import "github.com/google/uuid"

// ApartmentAmenity joins apartments to amenities.
//
// The pair is the primary key, which is what makes a duplicate link impossible
// rather than merely unlikely. It carries no surrogate id and no timestamps:
// there is nothing to say about the link beyond that it exists.
type ApartmentAmenity struct {
	ApartmentID uuid.UUID `gorm:"column:apartment_id;type:uuid;primaryKey" json:"apartment_id"`
	AmenityID   uuid.UUID `gorm:"column:amenity_id;type:uuid;primaryKey;index:idx_apartment_amenities_amenity_id" json:"amenity_id"`

	Apartment *Apartment `gorm:"foreignKey:ApartmentID;references:ID" json:"apartment,omitempty"`
	Amenity   *Amenity   `gorm:"foreignKey:AmenityID;references:ID" json:"amenity,omitempty"`
}

func (ApartmentAmenity) TableName() string { return "apartment_amenities" }
