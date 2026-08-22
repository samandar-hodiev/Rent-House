package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// AnalyticsRepository records view events and aggregates them.
//
// Every total here is produced by PostgreSQL. Nothing walks a result set in Go
// to add numbers up, and no caller ever receives individual events: a listing
// with a hundred thousand views must cost the same to chart as one with ten.
type AnalyticsRepository struct {
	db *gorm.DB
}

func NewAnalyticsRepository(db *gorm.DB) *AnalyticsRepository {
	return &AnalyticsRepository{db: db}
}

// ViewBucket is the deduplication window a moment falls into — the local hour,
// in Tashkent time. Two visits inside the same bucket are the same view.
func ViewBucket(at time.Time, location *time.Location) time.Time {
	local := at.In(location)
	return time.Date(local.Year(), local.Month(), local.Day(), local.Hour(), 0, 0, 0, location)
}

// RecordView files a view and reports whether it was a new one.
//
// Every rule about what counts lives in this one statement:
//
//   - INSERT ... SELECT means the row is written only if the listing is
//     published and the viewer is not its owner. Reading those facts first and
//     deciding in Go would be a race and two extra round trips.
//   - ON CONFLICT DO NOTHING is the deduplication. Two requests arriving
//     together would both find nothing and both insert; the unique index on
//     (apartment, viewer, hour) settles it inside the statement, and the row
//     count says which one won.
//
// The counter on the listing is bumped in the same transaction, so the total on
// the card and the events behind the chart cannot disagree.
func (r *AnalyticsRepository) RecordView(ctx context.Context, view *models.ApartmentView) (bool, error) {
	recorded := false

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Exec(`
			INSERT INTO apartment_views
				(apartment_id, viewer_id, viewer_key, view_bucket, viewed_at)
			SELECT a.id, ?, ?, ?, ?
			FROM apartments AS a
			WHERE a.id = ?
			  AND a.status = ?
			  AND (?::uuid IS NULL OR a.owner_id <> ?::uuid)
			ON CONFLICT (apartment_id, viewer_key, view_bucket) DO NOTHING
		`,
			view.ViewerID, view.ViewerKey, view.ViewBucket, view.ViewedAt,
			view.ApartmentID, models.ApartmentStatusActive,
			view.ViewerID, view.ViewerID,
		)

		if result.Error != nil {
			return fmt.Errorf("insert apartment view: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			// Not published, the owner's own visit, or already counted this
			// hour. None of the three is an error.
			return nil
		}

		if err := tx.Exec(
			`UPDATE apartments SET views_count = views_count + 1 WHERE id = ?`,
			view.ApartmentID,
		).Error; err != nil {
			return fmt.Errorf("increment views count: %w", err)
		}

		recorded = true
		return nil
	})

	return recorded, err
}

// PeriodCount is one bucket of the timeline: the period's first day and how
// many views fell inside it.
type PeriodCount struct {
	// Period is midnight local time on the first day of the day, week or month.
	Period time.Time `gorm:"column:period"`
	Views  int64     `gorm:"column:views"`
}

// ViewScope selects which listings an aggregate covers.
//
// Exactly one of the two is set. The dashboard asks for an owner's whole
// portfolio; a listing page asks for itself. Both run the same SQL, which is
// why per-listing analytics needed no second query to exist.
type ViewScope struct {
	OwnerID     *uuid.UUID
	ApartmentID *uuid.UUID
}

// granularity maps onto date_trunc's units. Not caller-supplied — these three
// strings are interpolated into SQL, so they are a closed set defined here.
const (
	GranularityDay   = "day"
	GranularityWeek  = "week"
	GranularityMonth = "month"
)

// CountViews groups an owner's or a listing's views by day, week or month.
//
// The timestamp is converted to Tashkent time *before* it is truncated, so a
// view at 23:30 local is filed under that evening rather than under the next
// morning in UTC. The result is converted back to timestamptz so the driver
// hands Go an unambiguous instant.
//
// Only active listings contribute: a draft has no audience, and a closed
// listing's history is not what the owner's live dashboard is reporting.
func (r *AnalyticsRepository) CountViews(
	ctx context.Context, scope ViewScope, granularity string, zone string,
) ([]PeriodCount, error) {
	if granularity != GranularityDay &&
		granularity != GranularityWeek &&
		granularity != GranularityMonth {
		return nil, fmt.Errorf("unsupported granularity %q", granularity)
	}

	query := r.db.WithContext(ctx).
		Table("apartment_views AS v").
		Joins("JOIN apartments AS a ON a.id = v.apartment_id").
		Where("a.status = ?", models.ApartmentStatusActive).
		// date_trunc's unit is a constant from the closed set checked above;
		// everything a caller controls is a bound parameter.
		Select(fmt.Sprintf(
			`date_trunc('%s', v.viewed_at AT TIME ZONE ?) AT TIME ZONE ? AS period,
			 COUNT(*) AS views`, granularity),
			zone, zone,
		).
		Group("period").
		Order("period")

	query = applyScope(query, scope)

	var rows []PeriodCount
	if err := query.Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("count views by %s: %w", granularity, err)
	}
	return rows, nil
}

// TotalViews is the number the chart's subtitle reports, counted rather than
// summed from the rows above so it stays right even when a period is empty.
func (r *AnalyticsRepository) TotalViews(ctx context.Context, scope ViewScope) (int64, error) {
	query := r.db.WithContext(ctx).
		Table("apartment_views AS v").
		Joins("JOIN apartments AS a ON a.id = v.apartment_id").
		Where("a.status = ?", models.ApartmentStatusActive)

	query = applyScope(query, scope)

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return 0, fmt.Errorf("count total views: %w", err)
	}
	return total, nil
}

// EarliestPublishedAt is where the timeline starts: the moment the oldest of
// these listings went live. Nil when the scope holds no published listing, and
// the caller renders an empty state rather than an axis.
func (r *AnalyticsRepository) EarliestPublishedAt(
	ctx context.Context, scope ViewScope,
) (*time.Time, error) {
	query := r.db.WithContext(ctx).
		Table("apartments AS a").
		Where("a.status = ?", models.ApartmentStatusActive).
		Where("a.published_at IS NOT NULL").
		Select("MIN(a.published_at)")

	switch {
	case scope.OwnerID != nil:
		query = query.Where("a.owner_id = ?", *scope.OwnerID)
	case scope.ApartmentID != nil:
		query = query.Where("a.id = ?", *scope.ApartmentID)
	}

	var earliest *time.Time
	if err := query.Row().Scan(&earliest); err != nil {
		return nil, fmt.Errorf("earliest published_at: %w", err)
	}
	return earliest, nil
}

func applyScope(query *gorm.DB, scope ViewScope) *gorm.DB {
	switch {
	case scope.OwnerID != nil:
		return query.Where("a.owner_id = ?", *scope.OwnerID)
	case scope.ApartmentID != nil:
		return query.Where("v.apartment_id = ?", *scope.ApartmentID)
	}
	return query
}
