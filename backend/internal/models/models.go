// Package models holds the GORM entities that map to the PostgreSQL schema.
//
// The schema itself is owned by the SQL files in backend/migrations — these
// structs describe it for the application, they do not create it. Keeping the
// two in step is deliberate: migrations are reviewable and reproducible, while
// AutoMigrate is not.
//
// Models carry no business logic. Validation, authorization and workflow rules
// belong in the service layer.
package models

import (
	"time"

	"github.com/google/uuid"
)

// Timestamps is embedded by every entity that records when it changed.
// The database supplies the defaults, so a plain INSERT is still correct.
type Timestamps struct {
	CreatedAt time.Time `gorm:"column:created_at;not null;default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at;not null;default:now()" json:"updated_at"`
}

// Base carries the shared UUID primary key. It is not named ID: an embedded
// type named ID would shadow its own ID field, so user.ID would return the
// struct rather than the uuid. Generation happens in PostgreSQL via
// gen_random_uuid(), built in since PG 13, so inserts made outside this
// application still get a valid key.
type Base struct {
	ID uuid.UUID `gorm:"column:id;type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
}
