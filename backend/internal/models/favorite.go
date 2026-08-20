package models

import (
	"time"

	"github.com/google/uuid"
)

// Favorite is a saved apartment.
//
// The (user_id, apartment_id) pair is unique, so saving the same listing twice
// is rejected by the database rather than guarded by application code.
type Favorite struct {
	Base
	UserID      uuid.UUID `gorm:"column:user_id;type:uuid;not null;uniqueIndex:uq_favorites_user_apartment,priority:1;index:idx_favorites_user_id" json:"user_id"`
	ApartmentID uuid.UUID `gorm:"column:apartment_id;type:uuid;not null;uniqueIndex:uq_favorites_user_apartment,priority:2;index:idx_favorites_apartment_id" json:"apartment_id"`

	CreatedAt time.Time `gorm:"column:created_at;not null;default:now()" json:"created_at"`

	User      *User      `gorm:"foreignKey:UserID;references:ID" json:"user,omitempty"`
	Apartment *Apartment `gorm:"foreignKey:ApartmentID;references:ID" json:"apartment,omitempty"`
}

func (Favorite) TableName() string { return "favorites" }
