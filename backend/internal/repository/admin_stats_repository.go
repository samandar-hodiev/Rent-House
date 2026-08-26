package repository

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// AdminStatsRepository answers the dashboard's questions.
//
// Separate from AdminRepository, which reads and writes accounts: this one only
// counts, and every count is a query rather than rows fetched and tallied in
// Go. A dashboard that loaded every user in order to say how many there are
// would work until the day it mattered.
type AdminStatsRepository struct {
	db *gorm.DB
}

func NewAdminStatsRepository(db *gorm.DB) *AdminStatsRepository {
	return &AdminStatsRepository{db: db}
}

// Overview is the row of figures across the top of the dashboard.
type Overview struct {
	TotalUsers      int64 `json:"total_users"`
	ActiveUsers     int64 `json:"active_users"`
	BlockedUsers    int64 `json:"blocked_users"`
	TotalListings   int64 `json:"total_listings"`
	ActiveListings  int64 `json:"active_listings"`
	PendingListings int64 `json:"pending_listings"`
	ClosedListings  int64 `json:"closed_listings"`
	Reports         int64 `json:"reports"`
	NewUsersToday   int64 `json:"new_users_today"`
}

// CountOverview gathers every headline figure.
//
// One statement, not nine round trips: each figure is a filtered count in the
// same SELECT, so the whole row of cards costs one query.
func (r *AdminStatsRepository) CountOverview(ctx context.Context, zone string) (*Overview, error) {
	var out Overview
	err := r.db.WithContext(ctx).Raw(`
		SELECT
			(SELECT count(*) FROM users)                                      AS total_users,
			(SELECT count(*) FROM users WHERE status = ?)                     AS active_users,
			(SELECT count(*) FROM users WHERE status = ?)                     AS blocked_users,
			-- A deleted listing is not a listing; it is a row kept for the
			-- owner's recycle bin, and counting it would inflate every total.
			(SELECT count(*) FROM apartments WHERE status <> ?)               AS total_listings,
			(SELECT count(*) FROM apartments WHERE status = ?)                AS active_listings,
			(SELECT count(*) FROM apartments WHERE status = ?)                AS pending_listings,
			(SELECT count(*) FROM apartments WHERE status = ?)                AS closed_listings,
			-- Reporting is not a feature this database has yet. Zero is what
			-- there is, and inventing a number would make the card a decoration.
			0                                                                 AS reports,
			-- "Today" is today in Tashkent, not in UTC: an account created at
			-- 02:00 local belongs to this morning, not to yesterday.
			(SELECT count(*) FROM users
			  WHERE (created_at AT TIME ZONE ?)::date = (now() AT TIME ZONE ?)::date)
			                                                                  AS new_users_today
	`,
		models.UserStatusActive, models.UserStatusBlocked,
		models.ApartmentStatusDeleted, models.ApartmentStatusActive,
		models.ApartmentStatusPending, models.ApartmentStatusClosed,
		zone, zone,
	).Scan(&out).Error
	if err != nil {
		return nil, fmt.Errorf("count overview: %w", err)
	}
	return &out, nil
}

// PeriodPoint is one bucket of a growth series.
type PeriodPoint struct {
	Period time.Time `json:"period"`
	Count  int64     `json:"count"`
}

// CountNewByPeriod counts rows created in each bucket of the given granularity,
// back to `since`.
//
// `table` is one of two constants chosen by the service, never anything a
// client sends: it is interpolated into the SQL, and everything a caller
// controls is a bound parameter.
//
// Only buckets that have rows come back. Filling the gaps is the service's job,
// because a chart needs every day on its axis and the database has no reason to
// invent rows that do not exist.
func (r *AdminStatsRepository) CountNewByPeriod(
	ctx context.Context, table, granularity, zone string, since time.Time, excludeDeleted bool,
) ([]PeriodPoint, error) {
	if granularity != GranularityDay &&
		granularity != GranularityWeek &&
		granularity != GranularityMonth {
		return nil, fmt.Errorf("unsupported granularity %q", granularity)
	}
	if table != "users" && table != "apartments" {
		return nil, fmt.Errorf("unsupported table %q", table)
	}

	query := r.db.WithContext(ctx).
		Table(table).
		Where("created_at >= ?", since).
		Select(fmt.Sprintf(
			`date_trunc('%s', created_at AT TIME ZONE ?) AT TIME ZONE ? AS period,
			 COUNT(*) AS count`, granularity),
			zone, zone,
		).
		Group("period").
		Order("period")

	if excludeDeleted {
		query = query.Where("status <> ?", models.ApartmentStatusDeleted)
	}

	var rows []PeriodPoint
	if err := query.Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("count %s by %s: %w", table, granularity, err)
	}
	return rows, nil
}

// DistrictActivity is one row of the "most active districts" chart.
type DistrictActivity struct {
	Name           string `json:"name"`
	ActiveListings int64  `json:"active_listings"`
}

// CountByDistrict returns every district with its live listing count, busiest
// first.
//
// A LEFT JOIN, so a district with nothing published still appears at zero: the
// chart is about all of Tashkent, and a missing district would read as a
// missing district rather than as a quiet one.
func (r *AdminStatsRepository) CountByDistrict(ctx context.Context) ([]DistrictActivity, error) {
	var rows []DistrictActivity
	err := r.db.WithContext(ctx).
		Table("districts AS d").
		Joins("LEFT JOIN apartments AS a ON a.district_id = d.id AND a.status = ?",
			models.ApartmentStatusActive).
		Select("d.name AS name, COUNT(a.id) AS active_listings").
		Group("d.id, d.name").
		Order("active_listings DESC, d.name").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("count by district: %w", err)
	}
	return rows, nil
}
