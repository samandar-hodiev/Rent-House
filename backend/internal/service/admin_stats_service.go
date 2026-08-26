package service

import (
	"context"
	"time"

	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
)

// The dashboard reports in local time. A day boundary at midnight UTC would put
// a Tashkent evening into the following day.
const dashboardZone = "Asia/Tashkent"

// How much of each series the charts show. Chosen here rather than by the
// client so every dashboard draws the same window.
const (
	dailyPoints   = 7
	weeklyPoints  = 5
	monthlyPoints = 12
)

// AdminStatsService turns database counts into the series the dashboard draws.
//
// The gap-filling lives here rather than in SQL: the database has no reason to
// invent rows for days on which nothing happened, and a chart needs every day
// on its axis regardless.
type AdminStatsService struct {
	stats *repository.AdminStatsRepository
}

func NewAdminStatsService(stats *repository.AdminStatsRepository) *AdminStatsService {
	return &AdminStatsService{stats: stats}
}

// Overview is the row of headline figures.
func (s *AdminStatsService) Overview(ctx context.Context) (*repository.Overview, error) {
	return s.stats.CountOverview(ctx, dashboardZone)
}

// Districts returns every district with its live listing count, busiest first.
func (s *AdminStatsService) Districts(ctx context.Context) ([]repository.DistrictActivity, error) {
	return s.stats.CountByDistrict(ctx)
}

// GrowthPoint is one labelled bucket, ready to plot.
type GrowthPoint struct {
	// Period is the start of the bucket, so the client can format it in
	// whichever language the administrator is reading.
	Period time.Time `json:"period"`
	Count  int64     `json:"count"`
}

// GrowthSeries is one metric at all three granularities.
type GrowthSeries struct {
	Daily   []GrowthPoint `json:"daily"`
	Weekly  []GrowthPoint `json:"weekly"`
	Monthly []GrowthPoint `json:"monthly"`
}

// Growth is what the two charts need, in one answer.
type Growth struct {
	Users    GrowthSeries `json:"users"`
	Listings GrowthSeries `json:"listings"`
}

// Growth builds both charts at every granularity.
//
// All six series in one call: they are small, and fetching them together means
// switching between Kunlik and Oylik is instant rather than a round trip.
func (s *AdminStatsService) Growth(ctx context.Context) (*Growth, error) {
	location, err := time.LoadLocation(dashboardZone)
	if err != nil {
		// A machine without tzdata. UTC is wrong by five hours, which is far
		// better than no dashboard at all.
		location = time.UTC
	}
	now := time.Now().In(location)

	users, err := s.series(ctx, "users", now, location, false)
	if err != nil {
		return nil, err
	}
	listings, err := s.series(ctx, "apartments", now, location, true)
	if err != nil {
		return nil, err
	}
	return &Growth{Users: *users, Listings: *listings}, nil
}

func (s *AdminStatsService) series(
	ctx context.Context, table string, now time.Time, location *time.Location, excludeDeleted bool,
) (*GrowthSeries, error) {
	daily, err := s.bucket(ctx, table, repository.GranularityDay, now, location, dailyPoints, excludeDeleted)
	if err != nil {
		return nil, err
	}
	weekly, err := s.bucket(ctx, table, repository.GranularityWeek, now, location, weeklyPoints, excludeDeleted)
	if err != nil {
		return nil, err
	}
	monthly, err := s.bucket(ctx, table, repository.GranularityMonth, now, location, monthlyPoints, excludeDeleted)
	if err != nil {
		return nil, err
	}
	return &GrowthSeries{Daily: daily, Weekly: weekly, Monthly: monthly}, nil
}

// bucket fetches one series and fills the gaps.
func (s *AdminStatsService) bucket(
	ctx context.Context, table, granularity string, now time.Time, location *time.Location,
	points int, excludeDeleted bool,
) ([]GrowthPoint, error) {
	starts := periodStarts(now, granularity, points, location)

	rows, err := s.stats.CountNewByPeriod(
		ctx, table, granularity, dashboardZone, starts[0], excludeDeleted,
	)
	if err != nil {
		return nil, err
	}

	// Keyed by the instant each bucket starts, which is what the query returns.
	counts := make(map[time.Time]int64, len(rows))
	for _, row := range rows {
		counts[row.Period.In(location)] = row.Count
	}

	series := make([]GrowthPoint, 0, points)
	for _, start := range starts {
		// A period with no rows is a zero, not a missing point: a day on which
		// nobody registered is information, and dropping it would make the line
		// skip a day without saying so.
		series = append(series, GrowthPoint{Period: start, Count: counts[start]})
	}
	return series, nil
}

// periodStarts lists the start of each bucket, oldest first, ending with the
// one in progress.
func periodStarts(
	now time.Time, granularity string, points int, location *time.Location,
) []time.Time {
	starts := make([]time.Time, 0, points)

	switch granularity {
	case repository.GranularityDay:
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location)
		for i := points - 1; i >= 0; i-- {
			starts = append(starts, today.AddDate(0, 0, -i))
		}

	case repository.GranularityWeek:
		// PostgreSQL's date_trunc('week') starts on Monday, so the buckets here
		// have to as well or nothing would line up.
		weekday := (int(now.Weekday()) + 6) % 7
		monday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location).
			AddDate(0, 0, -weekday)
		for i := points - 1; i >= 0; i-- {
			starts = append(starts, monday.AddDate(0, 0, -7*i))
		}

	case repository.GranularityMonth:
		first := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, location)
		for i := points - 1; i >= 0; i-- {
			starts = append(starts, first.AddDate(0, -i, 0))
		}
	}

	return starts
}
