package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

// Errors the report service reports. Each maps to one HTTP status.
var (
	// ErrReportNotFound is a complaint that does not exist.
	ErrReportNotFound = errors.New("report not found")

	// ErrCannotReportOwnListing is somebody reporting themselves. Not a
	// security matter — it is simply not a complaint, and letting it through
	// would let an owner raise the threshold on their own listing.
	ErrCannotReportOwnListing = errors.New("a listing cannot be reported by its owner")

	// ErrAlreadyReported is a second open complaint from the same account.
	ErrAlreadyReported = errors.New("this listing has already been reported")

	// ErrInvalidReportReason and ErrInvalidReportStatus are values outside the
	// closed sets the schema accepts.
	ErrInvalidReportReason = errors.New("unknown report reason")
	ErrInvalidReportStatus = errors.New("unknown report status")
)

// ReportService holds the rules about complaints: who may raise one, about
// what, and what happens to a listing that collects several.
type ReportService struct {
	reports    *repository.ReportRepository
	apartments *repository.ApartmentRepository
	settings   *SettingsService
	// The dashboard is told when a complaint arrives; without this the
	// section only fills up for somebody who thinks to look.
	notifications *NotificationService
	now           func() time.Time
}

func NewReportService(
	reports *repository.ReportRepository,
	apartments *repository.ApartmentRepository,
	settings *SettingsService,
	notifications *NotificationService,
) *ReportService {
	return &ReportService{
		reports: reports, apartments: apartments, settings: settings,
		notifications: notifications, now: time.Now,
	}
}

// SetClock replaces the service's clock. Tests only.
func (s *ReportService) SetClock(now func() time.Time) { s.now = now }

// Create records a complaint about a listing.
//
// The listing has to be one the reporter could actually see: reporting a draft
// would be reporting something that is not published, and answering differently
// for a draft that exists would say that it does.
func (s *ReportService) Create(
	ctx context.Context, apartmentID, reporterID uuid.UUID, reason, comment string,
) (*models.ListingReport, error) {
	if !contains(models.ReportReasons, reason) {
		return nil, ErrInvalidReportReason
	}

	apartment, err := s.apartments.FindByID(ctx, apartmentID)
	if err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return nil, ErrApartmentNotFound
		}
		return nil, err
	}
	if apartment.Status != models.ApartmentStatusActive {
		return nil, ErrApartmentNotFound
	}
	if apartment.OwnerID == reporterID {
		return nil, ErrCannotReportOwnListing
	}

	report := &models.ListingReport{
		ApartmentID: apartmentID,
		ReporterID:  &reporterID,
		Reason:      reason,
		Comment:     strings.TrimSpace(comment),
		Status:      models.ReportStatusOpen,
	}
	if err := s.reports.Create(ctx, report); err != nil {
		if errors.Is(err, repository.ErrReportDuplicate) {
			return nil, ErrAlreadyReported
		}
		return nil, err
	}

	s.notifications.NotifyAdmins(ctx,
		models.NotificationReportCreated, models.NotificationEntityReport, report.ID,
		models.JSONMap{"title": apartment.Title, "reason": reason},
	)

	s.applyThreshold(ctx, apartment)
	return report, nil
}

// applyThreshold sends a listing back for moderation once enough people have
// complained about it.
//
// Best-effort on purpose: the complaint has been recorded by the time this
// runs, and a listing that stays published one moment longer is a smaller
// failure than a complaint that was refused because the follow-up failed.
func (s *ReportService) applyThreshold(ctx context.Context, apartment *models.Apartment) {
	settings, err := s.settings.Get(ctx)
	if err != nil || settings.ReportThreshold < 1 {
		return
	}

	open, err := s.reports.CountOpenForApartment(ctx, apartment.ID)
	if err != nil {
		logger.Errorf("count open reports: %v", err)
		return
	}
	if open < int64(settings.ReportThreshold) {
		return
	}
	// Already off the public site: nothing to withdraw.
	if apartment.Status != models.ApartmentStatusActive {
		return
	}

	err = s.apartments.UpdateFields(ctx, apartment.ID, map[string]any{
		"status": models.ApartmentStatusPending,
		// Required by ck_apartments_published_at: only an active listing has a
		// publication date.
		"published_at": nil,
	})
	if err != nil {
		logger.Errorf("send reported listing to moderation: %v", err)
		return
	}
	logger.Infof("listing %s withdrawn after %d reports", apartment.ID, open)
}

// ReportPage is one page of the dashboard's list.
type ReportPage struct {
	Reports []repository.ReportRow
	Counts  map[string]int64
	Total   int64
	Page    int
	Limit   int
}

// List returns the complaints an administrator is looking at.
func (s *ReportService) List(
	ctx context.Context, status, search string, page, limit int,
) (*ReportPage, error) {
	if status != "" && !contains(models.ReportStatuses, status) {
		return nil, ErrInvalidReportStatus
	}
	if page < 1 {
		page = 1
	}
	switch {
	case limit < 1:
		limit = Defaults().PaginationDefaultSize
		if s.settings != nil {
			limit = s.settings.MustGet(ctx).PaginationDefaultSize
		}
	case limit > 100:
		limit = 100
	}

	rows, total, err := s.reports.List(ctx, repository.ReportQuery{
		Status: status, Search: strings.TrimSpace(search), Page: page, Limit: limit,
	})
	if err != nil {
		return nil, err
	}
	counts, err := s.reports.CountByStatus(ctx)
	if err != nil {
		return nil, err
	}

	return &ReportPage{Reports: rows, Counts: counts, Total: total, Page: page, Limit: limit}, nil
}

// SetStatus moves a complaint along and records who decided.
func (s *ReportService) SetStatus(
	ctx context.Context, id uuid.UUID, status, resolution string, adminID uuid.UUID,
) (*models.ListingReport, error) {
	if !contains(models.ReportStatuses, status) {
		return nil, ErrInvalidReportStatus
	}

	report, err := s.reports.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrReportNotFound) {
			return nil, ErrReportNotFound
		}
		return nil, err
	}
	if report.Status == status {
		return report, nil
	}

	trimmed := strings.TrimSpace(resolution)
	if len([]rune(trimmed)) > 1000 {
		return nil, fmt.Errorf("%w: resolution is too long", ErrInvalidReportStatus)
	}

	if err := s.reports.SetStatus(
		ctx, id, status, trimmed, adminID, s.now().UTC(),
	); err != nil {
		if errors.Is(err, repository.ErrReportNotFound) {
			return nil, ErrReportNotFound
		}
		return nil, err
	}

	return s.reports.FindByID(ctx, id)
}
