package dto

import "time"

// DayPoint is one calendar day and the views it received.
type DayPoint struct {
	// Date is a local calendar day, "2026-08-15" — not an instant. A day is
	// what the reader picked out of the chart, and giving it a timestamp would
	// invite a timezone conversion that moves it.
	Date  string `json:"date"`
	Views int64  `json:"views"`
}

// WeekPoint is a Monday-to-Sunday week, the convention in Uzbekistan and what
// PostgreSQL's date_trunc('week') already produces.
//
// Both ends are given so the tooltip can print "10–16 Avgust" without the
// client recomputing where the week ended and disagreeing with the query.
type WeekPoint struct {
	WeekStart string `json:"week_start"`
	WeekEnd   string `json:"week_end"`
	Views     int64  `json:"views"`
}

// MonthPoint is a calendar month, "2026-08".
type MonthPoint struct {
	Month string `json:"month"`
	Views int64  `json:"views"`
}

// ViewsAnalyticsResponse is the whole timeline for one scope — an owner's
// listings, or a single listing.
//
// The three series are aggregated independently by the database rather than
// derived from one another, so a week's total is what PostgreSQL counted for
// that week and not a sum the client assembled from days it happened to hold.
type ViewsAnalyticsResponse struct {
	TotalViews int64 `json:"total_views"`

	// PublishedAt is when the earliest listing in this scope went live, and
	// where the timeline starts. Nil when nothing is published — the client
	// shows an empty state rather than an axis with no meaning.
	PublishedAt *string `json:"published_at"`

	// RangeFrom and RangeTo bound the series, inclusive, in local days.
	RangeFrom *string `json:"range_from"`
	RangeTo   *string `json:"range_to"`

	// Timezone the days were computed in, so a client is never left guessing.
	Timezone string `json:"timezone"`

	// Gaps are filled with zeros: a day nobody visited is a real answer, and a
	// chart that skipped it would draw a straight line over the quiet week.
	Daily   []DayPoint   `json:"daily"`
	Weekly  []WeekPoint  `json:"weekly"`
	Monthly []MonthPoint `json:"monthly"`
}

// LocalDay formats an instant as the calendar day it falls on in `loc`.
func LocalDay(at time.Time, loc *time.Location) string {
	return at.In(loc).Format("2006-01-02")
}

// LocalMonth formats an instant as the calendar month it falls in.
func LocalMonth(at time.Time, loc *time.Location) string {
	return at.In(loc).Format("2006-01")
}
