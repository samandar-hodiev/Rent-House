package dto

import (
	"time"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
)

// ReportResponse is one complaint as the API returns it.
type ReportResponse struct {
	ID          string `json:"id"`
	ApartmentID string `json:"apartment_id"`
	Reason      string `json:"reason"`
	Comment     string `json:"comment"`
	Status      string `json:"status"`
	Resolution  string `json:"resolution,omitempty"`

	CreatedAt  time.Time  `json:"created_at"`
	ResolvedAt *time.Time `json:"resolved_at,omitempty"`
}

func NewReportResponse(report *models.ListingReport) ReportResponse {
	return ReportResponse{
		ID:          report.ID.String(),
		ApartmentID: report.ApartmentID.String(),
		Reason:      report.Reason,
		Comment:     report.Comment,
		Status:      report.Status,
		Resolution:  report.Resolution,
		CreatedAt:   report.CreatedAt,
		ResolvedAt:  report.ResolvedAt,
	}
}

// AdminReportResponse is one line of the dashboard's table: the complaint plus
// what a reviewer needs to judge it without opening anything else.
type AdminReportResponse struct {
	ReportResponse

	ApartmentTitle  string `json:"apartment_title"`
	ApartmentStatus string `json:"apartment_status"`
	ReporterName    string `json:"reporter_name"`
	ResolvedByName  string `json:"resolved_by_name,omitempty"`
	// OpenCount is how many complaints this listing has waiting, so one voice
	// and ten are visibly different.
	OpenCount int64 `json:"open_count"`
}

func NewReportRows(rows []repository.ReportRow) []AdminReportResponse {
	out := make([]AdminReportResponse, 0, len(rows))
	for i := range rows {
		row := rows[i]
		out = append(out, AdminReportResponse{
			ReportResponse:  NewReportResponse(&row.ListingReport),
			ApartmentTitle:  row.ApartmentTitle,
			ApartmentStatus: row.ApartmentStatus,
			ReporterName:    row.ReporterName,
			ResolvedByName:  row.ResolvedByName,
			OpenCount:       row.OpenCount,
		})
	}
	return out
}
