package models

import (
	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/shopspring/decimal"
)

// Currency codes a listing can be priced in.
const (
	CurrencyUZS = "UZS"
	CurrencyUSD = "USD"
)

// Rental periods a listing can be offered on.
const (
	RentalPeriodMonthly = "monthly"
	RentalPeriodDaily   = "daily"
)

// Listing lifecycle. Draft is the owner's private work in progress, pending is
// awaiting moderation, active is publicly searchable, closed is withdrawn.
const (
	ApartmentStatusDraft   = "draft"
	ApartmentStatusPending = "pending"
	ApartmentStatusActive  = "active"
	ApartmentStatusClosed  = "closed"
)

// Who pays for gas, water and electricity on top of the rent.
const (
	UtilitiesIncluded = "INCLUDED"
	UtilitiesSeparate = "SEPARATE"
)

// Accepted values, mirrored by CHECK constraints in the migration so a bad
// value cannot reach the table even through a direct SQL insert.
var (
	Currencies        = []string{CurrencyUZS, CurrencyUSD}
	RentalPeriods     = []string{RentalPeriodMonthly, RentalPeriodDaily}
	UtilitiesOptions  = []string{UtilitiesIncluded, UtilitiesSeparate}
	ApartmentStatuses = []string{
		ApartmentStatusDraft,
		ApartmentStatusPending,
		ApartmentStatusActive,
		ApartmentStatusClosed,
	}
)

// MaxMinimumMonths bounds the shortest-term field, matching the CHECK in 0003.
const MaxMinimumMonths = 60

// Apartment is a rental listing.
//
// Price is a decimal, not a float: money must not be subject to binary
// floating-point rounding. Coordinates stay float64 — they are measurements,
// not amounts, and double precision is well beyond the accuracy a map pin needs.
type Apartment struct {
	Base
	OwnerID    uuid.UUID `gorm:"column:owner_id;type:uuid;not null;index:idx_apartments_owner_id" json:"owner_id"`
	DistrictID uuid.UUID `gorm:"column:district_id;type:uuid;not null;index:idx_apartments_district_id" json:"district_id"`

	Title       string `gorm:"column:title;type:varchar(255);not null" json:"title"`
	Description string `gorm:"column:description;type:text;not null;default:''" json:"description"`

	Price        decimal.Decimal `gorm:"column:price;type:numeric(14,2);not null;index:idx_apartments_price" json:"price"`
	Currency     string          `gorm:"column:currency;type:varchar(3);not null;default:UZS" json:"currency"`
	RentalPeriod string          `gorm:"column:rental_period;type:varchar(10);not null;default:monthly" json:"rental_period"`

	Rooms       int16 `gorm:"column:rooms;not null;index:idx_apartments_rooms" json:"rooms"`
	Area        int32 `gorm:"column:area;not null" json:"area"`
	Floor       int16 `gorm:"column:floor;not null" json:"floor"`
	TotalFloors int16 `gorm:"column:total_floors;not null" json:"total_floors"`
	Furnished   bool  `gorm:"column:furnished;not null;default:false" json:"furnished"`

	Status string `gorm:"column:status;type:varchar(10);not null;default:draft;index:idx_apartments_status" json:"status"`

	Address   string  `gorm:"column:address;type:varchar(255);not null" json:"address"`
	Latitude  float64 `gorm:"column:latitude;type:double precision;not null" json:"latitude"`
	Longitude float64 `gorm:"column:longitude;type:double precision;not null" json:"longitude"`

	// Finer-grained than a district and what people actually search by. Free
	// text, because Tashkent neighbourhood names are informal and overlapping.
	Neighborhood *string `gorm:"column:neighborhood;type:varchar(120)" json:"neighborhood,omitempty"`

	// How the place is let. Nil deposit means none was asked for; nil
	// MinimumMonths means no minimum term.
	Deposit       *decimal.Decimal `gorm:"column:deposit;type:numeric(14,2)" json:"deposit,omitempty"`
	Utilities     string           `gorm:"column:utilities;type:varchar(10);not null;default:INCLUDED" json:"utilities"`
	MinimumMonths *int16           `gorm:"column:minimum_months" json:"minimum_months,omitempty"`
	// House rules as stable slugs. pq.StringArray maps Postgres text[].
	Rules pq.StringArray `gorm:"column:rules;type:text[];not null;default:'{}'" json:"rules"`

	ViewsCount int64 `gorm:"column:views_count;not null;default:0" json:"views_count"`

	Timestamps

	Owner    *User     `gorm:"foreignKey:OwnerID;references:ID" json:"owner,omitempty"`
	District *District `gorm:"foreignKey:DistrictID;references:ID" json:"district,omitempty"`

	Images        []ApartmentImage `gorm:"foreignKey:ApartmentID" json:"images,omitempty"`
	Amenities     []Amenity        `gorm:"many2many:apartment_amenities;joinForeignKey:ApartmentID;joinReferences:AmenityID" json:"amenities,omitempty"`
	Favorites     []Favorite       `gorm:"foreignKey:ApartmentID" json:"favorites,omitempty"`
	Conversations []Conversation   `gorm:"foreignKey:ApartmentID" json:"conversations,omitempty"`
}

func (Apartment) TableName() string { return "apartments" }
