// Views analytics for the dashboard chart.
//
// THIS FILE IS THE ONLY MOCK ON THE DASHBOARD. The listing count and the unread
// message count both come from real application state (ListingsContext and
// ChatContext); views over time is the one figure nothing in the app records
// yet, because no endpoint counts a view.
//
// The seam: `GET /api/v1/users/me/analytics/views` returns exactly what
// `getViewsAnalytics()` returns, so replacing the body of that function with a
// fetch leaves the chart, the tooltip and the filters untouched.
//
//   {
//     points: [
//       { date: '2026-08-18', daily: 124, weekly: 842, monthly: 3421 },
//       ...
//     ],
//   }
//
// One row per day carrying all three figures, so the chart and the tooltip read
// the same numbers from the same place — there is no second copy to drift.
//
//   daily   views on that day
//   weekly  views over the whole calendar week (Mon-Sun) that day falls in
//   monthly views over the whole calendar month that day falls in
//
// Weekly and monthly are period *totals*, not averages, which is why a week
// reads in the thousands where a day reads in the hundreds. They are totals for
// the entire period, so every day inside one week reports that week's figure —
// the line holds a plateau and steps at the boundary.
//
// The alternative, a running period-to-date, resets to near zero every Monday
// and every 1st of the month. That produces a sawtooth that says far more about
// where the calendar was cut than about the traffic, and it dominates the chart
// once several series share an axis. A period in progress is still reported
// to-date, because the remaining days have not happened yet.

const DAY_MS = 24 * 60 * 60 * 1000

// Days rendered on the x-axis.
const RANGE_DAYS = 30
// Extra history generated behind the range so the first visible day already has
// a complete week and month behind it.
const WARMUP_DAYS = 62

// A fixed shape rather than Math.random(), so the chart is identical on every
// render and every reload, and a screenshot can be compared to the last one.
// Weekly rhythm plus a slow upward drift — what a listing's traffic looks like.
function dailyValueFor(dayIndex) {
  const weekday = dayIndex % 7
  const weekendLift = weekday === 5 || weekday === 6 ? 46 : weekday === 2 ? -22 : 0
  const drift = dayIndex * 1.4
  const wave = Math.round(28 * Math.sin(dayIndex / 3.2))
  return Math.max(0, Math.round(96 + drift + weekendLift + wave))
}

const toKey = (date) => date.toISOString().slice(0, 10)

// Monday-based week start, which is the convention in Uzbekistan.
function startOfWeek(date) {
  const start = new Date(date)
  const weekday = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - weekday)
  return start
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

/**
 * Returns one row per rendered day, oldest first.
 *
 * Dates are ISO day strings: no date library to carry, and the field a real API
 * would return unchanged.
 */
export function getViewsAnalytics() {
  const total = WARMUP_DAYS + RANGE_DAYS
  const today = new Date(new Date().toISOString().slice(0, 10))

  // Every day we know about, including the warm-up behind the visible range.
  const byDay = new Map()
  for (let index = 0; index < total; index += 1) {
    const date = new Date(today.getTime() - (total - 1 - index) * DAY_MS)
    byDay.set(toKey(date), dailyValueFor(index))
  }

  // Sums every day we have data for between `from` and `to` inclusive. Days
  // beyond today are simply absent from the map, so a period still in progress
  // totals only the days that have actually happened.
  const sumRange = (from, to) => {
    let sum = 0
    for (let cursor = new Date(from); cursor <= to; cursor = new Date(cursor.getTime() + DAY_MS)) {
      sum += byDay.get(toKey(cursor)) ?? 0
    }
    return sum
  }

  const endOfWeek = (date) => new Date(startOfWeek(date).getTime() + 6 * DAY_MS)
  const endOfMonth = (date) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))

  // One entry per period rather than per day, so a week's total is summed once
  // and shared by all seven of its days instead of being recomputed seven times.
  const weekTotals = new Map()
  const monthTotals = new Map()

  const points = []
  for (let index = 0; index < RANGE_DAYS; index += 1) {
    const date = new Date(today.getTime() - (RANGE_DAYS - 1 - index) * DAY_MS)

    const weekKey = toKey(startOfWeek(date))
    if (!weekTotals.has(weekKey)) {
      weekTotals.set(weekKey, sumRange(startOfWeek(date), endOfWeek(date)))
    }

    const monthKey = toKey(startOfMonth(date))
    if (!monthTotals.has(monthKey)) {
      monthTotals.set(monthKey, sumRange(startOfMonth(date), endOfMonth(date)))
    }

    points.push({
      date: toKey(date),
      daily: byDay.get(toKey(date)) ?? 0,
      weekly: weekTotals.get(weekKey),
      monthly: monthTotals.get(monthKey),
    })
  }

  return { points }
}

/** Total views across the rendered window — the figure under the chart title. */
export function getTotalViews(analytics) {
  return analytics.points.reduce((sum, point) => sum + point.daily, 0)
}
