package models

// Amenity is reference data: a feature an apartment can offer. Apartments link
// to it through apartment_amenities rather than repeating the label.
type Amenity struct {
	Base
	Name string  `gorm:"column:name;type:varchar(100);not null" json:"name"`
	Slug string  `gorm:"column:slug;type:varchar(100);not null;uniqueIndex:uq_amenities_slug" json:"slug"`
	Icon *string `gorm:"column:icon;type:varchar(100)" json:"icon,omitempty"`

	Timestamps

	Apartments []Apartment `gorm:"many2many:apartment_amenities;joinForeignKey:AmenityID;joinReferences:ApartmentID" json:"apartments,omitempty"`
}

func (Amenity) TableName() string { return "amenities" }
