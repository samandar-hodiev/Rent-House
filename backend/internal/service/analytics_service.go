package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
)

// MaxAnalyticsDays bounds the daily series.
//
// "Barchasi" means the whole period a listing has been live, and for anything
// this application will hold that is months, not years. The cap exists so a
// listing left up for a decade cannot ask the API to return four thousand
// points; weekly and monthly still cover the full history.
const MaxAnalyticsDays = 365

// AnalyticsService records views and answers questions about them.
type AnalyticsService struct {
	analytics  *repository.AnalyticsRepository
	apartments *repository.ApartmentRepository
	location   *time.Location
	// viewerSalt keys the hash that tells two anonymous visitors apart. See
	// NewAnalyticsService.
	viewerSalt []byte
}

// NewAnalyticsService builds the service.
//
// `secret` is the application secret. It is not used directly: the viewer salt
// is derived from it under its own label, so the value that identifies a
// visitor is unrelated to the value that signs a token, and neither can be
// derived from the other.
func NewAnalyticsService(
	analytics *repository.AnalyticsRepository,
	apartments *repository.ApartmentRepository,
	secret string,
) (*AnalyticsService, error) {
	location, err := time.LoadLocation(models.TashkentZone)
	if err != nil {
		return nil, fmt.Errorf("load %s: %w", models.TashkentZone, err)
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte("renthouse/apartment-view-key"))

	return &AnalyticsService{
		analytics:  analytics,
		apartments: apartments,
		location:   location,
		viewerSalt: mac.Sum(nil),
	}, nil
}

// ViewRequest is what the handler knows about one page view.
type ViewRequest struct {
	ApartmentID uuid.UUID
	// ViewerID is nil for a signed-out visitor.
	ViewerID *uuid.UUID
	// RemoteAddr and UserAgent tell anonymous visitors apart. They are hashed
	// immediately and never stored.
	RemoteAddr string
	UserAgent  string
}

// RecordView counts a view of a listing, unless this visitor already counted
// within the deduplication window.
//
// Returns whether a new view was recorded, which the caller uses only to keep
// the number it is about to return in step.
func (s *AnalyticsService) RecordView(ctx context.Context, req ViewRequest) (bool, error) {
	now := time.Now()

	view := &models.ApartmentView{
		ApartmentID: req.ApartmentID,
		ViewerID:    req.ViewerID,
		ViewerKey:   s.viewerKey(req),
		ViewBucket:  repository.ViewBucket(now, s.location),
		ViewedAt:    now,
	}
	return s.analytics.RecordView(ctx, view)
}

// viewerKey identifies a viewer for deduplication only.
//
// A signed-in user is their id: they are the same person on their phone and
// their laptop, and refreshing on either should not count twice. A signed-out
// visitor is a keyed hash of address and user agent — enough to tell two
// people apart for an hour, and not something that can be turned back into an
// address, because the raw values are never written down.
func (s *AnalyticsService) viewerKey(req ViewRequest) string {
	if req.ViewerID != nil {
		return "u:" + req.ViewerID.String()
	}

	mac := hmac.New(sha256.New, s.viewerSalt)
	mac.Write([]byte(req.RemoteAddr))
	mac.Write([]byte{0}) // separator, so addr+ua cannot be shifted between fields
	mac.Write([]byte(req.UserAgent))
	return "a:" + hex.EncodeToString(mac.Sum(nil))[:40]
}

// OwnerAnalytics is the dashboard timeline: every published listing this user
// owns, aggregated into one set of series.
func (s *AnalyticsService) OwnerAnalytics(
	ctx context.Context, ownerID uuid.UUID,
) (*dto.ViewsAnalyticsResponse, error) {
	return s.build(ctx, repository.ViewScope{OwnerID: &ownerID})
}

// ApartmentAnalytics is one listing's timeline, for its owner.
//
// The same aggregation as the dashboard with a narrower scope — which is the
// point of scoping the queries rather than writing a dashboard query: showing
// a chart on a listing page later needs no new SQL.
func (s *AnalyticsService) ApartmentAnalytics(
	ctx context.Context, apartmentID, actorID uuid.UUID,
) (*dto.ViewsAnalyticsResponse, error) {
	ownerID, err := s.apartments.FindOwnerID(ctx, apartmentID)
	if err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return nil, ErrApartmentNotFound
		}
		return nil, err
	}
	// How many people looked at a listing is the owner's business.
	if ownerID != actorID {
		return nil, ErrNotApartmentOwner
	}

	return s.build(ctx, repository.ViewScope{ApartmentID: &apartmentID})
}

func (s *AnalyticsService) build(
	ctx context.Context, scope repository.ViewScope,
) (*dto.ViewsAnalyticsResponse, error) {
	out := &dto.ViewsAnalyticsResponse{
		Timezone: models.TashkentZone,
		Daily:    []dto.DayPoint{},
		Weekly:   []dto.WeekPoint{},
		Monthly:  []dto.MonthPoint{},
	}

	published, err := s.analytics.EarliestPublishedAt(ctx, scope)
	if err != nil {
		return nil, err
	}
	// Nothing published: no timeline exists to draw, and inventing one would be
	// the fabricated data this is meant to replace.
	if published == nil {
		return out, nil
	}

	publishedDay := s.startOfDay(*published)
	out.PublishedAt = strPtr(dto.LocalDay(publishedDay, s.location))

	total, err := s.analytics.TotalViews(ctx, scope)
	if err != nil {
		return nil, err
	}
	out.TotalViews = total

	// The window: from publication to today, never earlier than publication —
	// days before the listing existed had no audience to report.
	today := s.startOfDay(time.Now())
	from := publishedDay
	if earliest := today.AddDate(0, 0, -(MaxAnalyticsDays - 1)); from.Before(earliest) {
		from = earliest
	}
	if from.After(today) {
		// Published later today; the range is that single day.
		from = today
	}
	out.RangeFrom = strPtr(dto.LocalDay(from, s.location))
	out.RangeTo = strPtr(dto.LocalDay(today, s.location))

	if out.Daily, err = s.daily(ctx, scope, from, today); err != nil {
		return nil, err
	}
	if out.Weekly, err = s.weekly(ctx, scope, publishedDay, today); err != nil {
		return nil, err
	}
	if out.Monthly, err = s.monthly(ctx, scope, publishedDay, today); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *AnalyticsService) daily(
	ctx context.Context, scope repository.ViewScope, from, to time.Time,
) ([]dto.DayPoint, error) {
	counts, err := s.counts(ctx, scope, repository.GranularityDay)
	if err != nil {
		return nil, err
	}

	points := []dto.DayPoint{}
	for day := from; !day.After(to); day = day.AddDate(0, 0, 1) {
		key := dto.LocalDay(day, s.location)
		points = append(points, dto.DayPoint{Date: key, Views: counts[key]})
	}
	return points, nil
}

func (s *AnalyticsService) weekly(
	ctx context.Context, scope repository.ViewScope, from, to time.Time,
) ([]dto.WeekPoint, error) {
	counts, err := s.counts(ctx, scope, repository.GranularityWeek)
	if err != nil {
		return nil, err
	}

	points := []dto.WeekPoint{}
	for week := s.startOfWeek(from); !week.After(to); week = week.AddDate(0, 0, 7) {
		key := dto.LocalDay(week, s.location)
		points = append(points, dto.WeekPoint{
			WeekStart: key,
			WeekEnd:   dto.LocalDay(week.AddDate(0, 0, 6), s.location),
			Views:     counts[key],
		})
	}
	return points, nil
}

func (s *AnalyticsService) monthly(
	ctx context.Context, scope repository.ViewScope, from, to time.Time,
) ([]dto.MonthPoint, error) {
	counts, err := s.counts(ctx, scope, repository.GranularityMonth)
	if err != nil {
		return nil, err
	}

	points := []dto.MonthPoint{}
	for month := s.startOfMonth(from); !month.After(to); month = month.AddDate(0, 1, 0) {
		// Keyed by the month's first day, which is what date_trunc returns;
		// reported as "2006-01", which is what a month means to a reader.
		key := dto.LocalDay(month, s.location)
		points = append(points, dto.MonthPoint{
			Month: dto.LocalMonth(month, s.location),
			Views: counts[key],
		})
	}
	return points, nil
}

// counts runs one aggregate and keys it by local day, which is the form every
// gap-filling loop above looks values up in.
func (s *AnalyticsService) counts(
	ctx context.Context, scope repository.ViewScope, granularity string,
) (map[string]int64, error) {
	rows, err := s.analytics.CountViews(ctx, scope, granularity, models.TashkentZone)
	if err != nil {
		return nil, err
	}

	byPeriod := make(map[string]int64, len(rows))
	for _, row := range rows {
		byPeriod[dto.LocalDay(row.Period, s.location)] = row.Views
	}
	return byPeriod, nil
}

func (s *AnalyticsService) startOfDay(at time.Time) time.Time {
	local := at.In(s.location)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, s.location)
}

// startOfWeek is the Monday of that week, matching both local convention and
// PostgreSQL's date_trunc('week').
func (s *AnalyticsService) startOfWeek(at time.Time) time.Time {
	day := s.startOfDay(at)
	offset := (int(day.Weekday()) + 6) % 7 // Sunday is 0 in Go, 6 here
	return day.AddDate(0, 0, -offset)
}

func (s *AnalyticsService) startOfMonth(at time.Time) time.Time {
	local := at.In(s.location)
	return time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, s.location)
}

func strPtr(value string) *string { return &value }
