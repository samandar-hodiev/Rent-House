// Views analytics for the dashboard chart.
//
// THIS FILE IS THE ONLY MOCK IN THE OVERVIEW. The listing count and the unread
// message count both come from real application state (ListingsContext and
// ChatContext); views over time is the one figure nothing in the app tracks
// yet, because no endpoint records a view.
//
// The seam: `GET /api/v1/users/me/analytics/views` returns exactly the object
// `getViewsAnalytics()` returns, so replacing this file with a fetch leaves
// ViewsChart and DashboardOverview untouched.
//
//   {
//     dailyViews:   [{ date: '2026-08-20', value: 42 }, ...],
//     weeklyViews:  [{ date: '2026-08-20', value: 38 }, ...],
//     monthlyViews: [{ date: '2026-08-20', value: 35 }, ...],
//   }
//
// All three series share one unit — views per day — which is what lets them sit
// on a single axis and be compared honestly. `weeklyViews` and `monthlyViews`
// are the 7- and 30-day trailing averages of the daily figure, the usual way an
// analytics view separates a spike from a trend. Plotting period *totals*
// instead would put a monthly bar thirty times higher than a daily one and
// flatten the daily line into the axis.

const DAY_MS = 24 * 60 * 60 * 1000
const RANGE_DAYS = 30
const WEEK = 7
const MONTH = 30

// A fixed shape rather than Math.random(), so the chart looks the same on every
// render and in every screenshot. Weekly rhythm plus a slow upward drift, which
// is what a listing's traffic actually looks like.
function dailyValueFor(dayIndex) {
  const weekday = dayIndex % 7
  // Weekends bring more browsing; midweek dips.
  const weekendLift = weekday === 5 || weekday === 6 ? 14 : weekday === 2 ? -6 : 0
  const drift = dayIndex * 0.55
  const wave = Math.round(9 * Math.sin(dayIndex / 3.2))
  return Math.max(0, Math.round(28 + drift + weekendLift + wave))
}

// Trailing average over `window` days, clamped at the start of the range where
// there is not yet a full window of history.
function trailingAverage(values, index, window) {
  const start = Math.max(0, index - window + 1)
  const slice = values.slice(start, index + 1)
  const total = slice.reduce((sum, value) => sum + value, 0)
  return Math.round(total / slice.length)
}

/**
 * Returns the three series, oldest point first.
 *
 * Dates are ISO day strings so the chart can label an axis without carrying a
 * date library, and so a real API can return the same field unchanged.
 */
export function getViewsAnalytics() {
  const today = Date.now()
  const daily = Array.from({ length: RANGE_DAYS }, (_, index) => dailyValueFor(index))

  const dateAt = (index) =>
    new Date(today - (RANGE_DAYS - 1 - index) * DAY_MS).toISOString().slice(0, 10)

  return {
    dailyViews: daily.map((value, index) => ({ date: dateAt(index), value })),
    weeklyViews: daily.map((value, index) => ({
      date: dateAt(index),
      value: trailingAverage(daily, index, WEEK),
    })),
    monthlyViews: daily.map((value, index) => ({
      date: dateAt(index),
      value: trailingAverage(daily, index, MONTH),
    })),
  }
}

/** Total views across the window — the supporting figure under the chart. */
export function getTotalViews(analytics) {
  return analytics.dailyViews.reduce((sum, point) => sum + point.value, 0)
}
