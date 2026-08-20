package models

// District is reference data: the Tashkent districts an apartment can sit in.
// Apartments reference it by id so a district name exists in exactly one place.
type District struct {
	Base
	Name string `gorm:"column:name;type:varchar(100);not null;uniqueIndex:uq_districts_name" json:"name"`
	Slug string `gorm:"column:slug;type:varchar(100);not null;uniqueIndex:uq_districts_slug" json:"slug"`

	// Centre point, used to frame the map when a district is selected.
	Latitude  float64 `gorm:"column:latitude;type:double precision;not null" json:"latitude"`
	Longitude float64 `gorm:"column:longitude;type:double precision;not null" json:"longitude"`

	Timestamps

	Apartments []Apartment `gorm:"foreignKey:DistrictID" json:"apartments,omitempty"`
}

func (District) TableName() string { return "districts" }
