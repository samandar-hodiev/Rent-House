package models

import (
	"time"

	"github.com/google/uuid"
)

// Why a listing was reported. A closed set so the dashboard can count and group
// them; anything the set does not cover goes in the comment beside it.
const (
	ReportReasonFraud       = "fraud"
	ReportReasonWrongInfo   = "wrong_info"
	ReportReasonUnavailable = "unavailable"
	ReportReasonDuplicate   = "duplicate"
	ReportReasonOffensive   = "offensive"
	ReportReasonOther       = "other"
)

// ReportReasons is every accepted reason, for validation and for the form.
var ReportReasons = []string{
	ReportReasonFraud, ReportReasonWrongInfo, ReportReasonUnavailable,
	ReportReasonDuplicate, ReportReasonOffensive, ReportReasonOther,
}

// Where a report stands.
//
// `reviewing` exists so two administrators do not both start on the same
// complaint; `dismissed` is a decision, not a deletion — a report that turned
// out to be groundless is still part of a listing's history.
const (
	ReportStatusOpen      = "open"
	ReportStatusReviewing = "reviewing"
	ReportStatusResolved  = "resolved"
	ReportStatusDismissed = "dismissed"
)

var ReportStatuses = []string{
	ReportStatusOpen, ReportStatusReviewing, ReportStatusResolved, ReportStatusDismissed,
}

// IsOpenReportStatus reports whether a status still counts as waiting — which
// is what the moderation threshold counts and what the unique index guards.
func IsOpenReportStatus(status string) bool {
	return status == ReportStatusOpen || status == ReportStatusReviewing
}

// ListingReport is one complaint about one listing.
type ListingReport struct {
	ID          uuid.UUID  `gorm:"column:id;type:uuid;default:gen_random_uuid();primaryKey"`
	ApartmentID uuid.UUID  `gorm:"column:apartment_id;type:uuid;not null"`
	ReporterID  *uuid.UUID `gorm:"column:reporter_id;type:uuid"`

	Reason  string `gorm:"column:reason;type:varchar(30);not null"`
	Comment string `gorm:"column:comment;type:varchar(1000);not null;default:''"`

	Status string `gorm:"column:status;type:varchar(20);not null;default:open"`

	ResolvedBy *uuid.UUID `gorm:"column:resolved_by;type:uuid"`
	ResolvedAt *time.Time `gorm:"column:resolved_at"`
	Resolution string     `gorm:"column:resolution;type:varchar(1000);not null;default:''"`

	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime"`
}

func (ListingReport) TableName() string { return "listing_reports" }
