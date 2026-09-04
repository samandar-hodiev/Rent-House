package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

var (
	// ErrReportNotFound is a report that does not exist.
	ErrReportNotFound = errors.New("report not found")

	// ErrReportDuplicate is a second open report on the same listing by the
	// same person, which the unique index refuses.
	ErrReportDuplicate = errors.New("this listing has already been reported by this account")
)

// ReportRepository reads and writes complaints about listings.
type ReportRepository struct {
	db *gorm.DB
}

func NewReportRepository(db *gorm.DB) *ReportRepository {
	return &ReportRepository{db: db}
}

// Create records one complaint.
func (r *ReportRepository) Create(ctx context.Context, report *models.ListingReport) error {
	err := r.db.WithContext(ctx).Create(report).Error
	if err != nil {
		if isConstraint(err, "uq_listing_reports_open") {
			return ErrReportDuplicate
		}
		return fmt.Errorf("create report: %w", err)
	}
	return nil
}

// CountOpenForApartment is how many complaints a listing currently has waiting.
// This is the number the moderation threshold compares against.
func (r *ReportRepository) CountOpenForApartment(
	ctx context.Context, apartmentID uuid.UUID,
) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&models.ListingReport{}).
		Where("apartment_id = ? AND status IN ?", apartmentID,
			[]string{models.ReportStatusOpen, models.ReportStatusReviewing}).
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("count open reports: %w", err)
	}
	return count, nil
}

// ReportRow is one line of the dashboard's list: the complaint, plus enough of
// the listing and the reporter to be read without a second query.
type ReportRow struct {
	models.ListingReport

	ApartmentTitle  string `gorm:"column:apartment_title"`
	ApartmentStatus string `gorm:"column:apartment_status"`
	ReporterName    string `gorm:"column:reporter_name"`
	ResolvedByName  string `gorm:"column:resolved_by_name"`
	// OpenCount is how many complaints this listing has waiting in total, so a
	// reviewer can see at a glance whether this is one voice or ten.
	OpenCount int64 `gorm:"column:open_count"`
}

// ReportQuery is one page of the dashboard's list.
type ReportQuery struct {
	Status string
	Search string
	Page   int
	Limit  int
}

// List returns one page of complaints and how many match in total.
//
// Joined and counted by PostgreSQL: the listing's title and the reporter's name
// are what the table shows, and fetching them row by row in Go would be one
// query per line.
func (r *ReportRepository) List(
	ctx context.Context, query ReportQuery,
) ([]ReportRow, int64, error) {
	base := r.db.WithContext(ctx).
		Table("listing_reports AS r").
		Joins("JOIN apartments AS a ON a.id = r.apartment_id").
		Joins("LEFT JOIN users AS u ON u.id = r.reporter_id").
		Joins("LEFT JOIN admins AS ad ON ad.id = r.resolved_by")

	if query.Status != "" {
		base = base.Where("r.status = ?", query.Status)
	}
	if search := query.Search; search != "" {
		pattern := "%" + escapeLike(search) + "%"
		base = base.Where(
			"(a.title ILIKE ? OR r.comment ILIKE ? OR u.first_name ILIKE ? OR u.last_name ILIKE ?)",
			pattern, pattern, pattern, pattern,
		)
	}

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count reports: %w", err)
	}
	if total == 0 {
		return []ReportRow{}, 0, nil
	}

	limit := query.Limit
	if limit <= 0 {
		limit = 20
	}
	page := query.Page
	if page <= 0 {
		page = 1
	}

	rows := []ReportRow{}
	err := base.
		Select(`r.*,
			a.title AS apartment_title,
			a.status AS apartment_status,
			TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS reporter_name,
			COALESCE(ad.name, '') AS resolved_by_name,
			(SELECT COUNT(*) FROM listing_reports o
			  WHERE o.apartment_id = r.apartment_id
			    AND o.status IN ('open', 'reviewing')) AS open_count`).
		Order("r.created_at DESC").
		Limit(limit).Offset((page - 1) * limit).
		Scan(&rows).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list reports: %w", err)
	}
	return rows, total, nil
}

// CountByStatus is the tally the dashboard shows above the table.
func (r *ReportRepository) CountByStatus(ctx context.Context) (map[string]int64, error) {
	type row struct {
		Status string
		Count  int64
	}
	rows := []row{}
	err := r.db.WithContext(ctx).Model(&models.ListingReport{}).
		Select("status, COUNT(*) AS count").Group("status").Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("count reports by status: %w", err)
	}

	out := make(map[string]int64, len(rows))
	for _, entry := range rows {
		out[entry.Status] = entry.Count
	}
	return out, nil
}

// FindByID loads one complaint.
func (r *ReportRepository) FindByID(
	ctx context.Context, id uuid.UUID,
) (*models.ListingReport, error) {
	var report models.ListingReport
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&report).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return nil, ErrReportNotFound
	case err != nil:
		return nil, fmt.Errorf("find report: %w", err)
	}
	return &report, nil
}

// SetStatus moves a complaint along.
//
// The decision's author and date are written with it, and cleared when it goes
// back to being open — the schema insists the two agree.
func (r *ReportRepository) SetStatus(
	ctx context.Context, id uuid.UUID, status, resolution string,
	adminID uuid.UUID, now time.Time,
) error {
	fields := map[string]any{
		"status":     status,
		"resolution": resolution,
		"updated_at": now,
	}
	if models.IsOpenReportStatus(status) {
		fields["resolved_at"] = nil
		fields["resolved_by"] = nil
	} else {
		fields["resolved_at"] = now
		fields["resolved_by"] = adminID
	}

	result := r.db.WithContext(ctx).Model(&models.ListingReport{}).
		Where("id = ?", id).Updates(fields)
	if result.Error != nil {
		return fmt.Errorf("update report: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrReportNotFound
	}
	return nil
}
