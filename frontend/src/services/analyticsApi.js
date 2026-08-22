// Apartment view analytics.
//
// Everything here is counted by PostgreSQL. The client receives period totals
// and never individual view events, so a listing with a hundred thousand views
// costs the same to chart as one with ten.
import { request } from './apiClient'

/** Maps the API's timeline onto the shape the dashboard reads. */
export function toAnalytics(data) {
  return {
    totalViews: data.total_views ?? 0,
    // Null when the owner has nothing published — the dashboard shows an empty
    // state rather than an axis with no meaning behind it.
    publishedAt: data.published_at ?? null,
    rangeFrom: data.range_from ?? null,
    rangeTo: data.range_to ?? null,
    timezone: data.timezone ?? 'Asia/Tashkent',
    daily: data.daily ?? [],
    weekly: data.weekly ?? [],
    monthly: data.monthly ?? [],
  }
}

/** The signed-in owner's whole portfolio, as one timeline. */
export async function fetchViewsAnalytics({ token, signal } = {}) {
  return toAnalytics(await request('/me/analytics/views', { token, signal }))
}

/** One listing's timeline. Owner only — the API answers 403 to anyone else. */
export async function fetchApartmentAnalytics(id, { token, signal } = {}) {
  return toAnalytics(await request(`/apartments/${id}/analytics`, { token, signal }))
}

/**
 * Turns the three server-side aggregates into the one-row-per-day shape the
 * chart draws.
 *
 * This is a lookup, not a calculation: each day is labelled with the week and
 * month totals PostgreSQL counted for the period it falls in. The client never
 * sums anything, so a week's figure is what the database said it was and not
 * an addition assembled from whichever days happen to be in range.
 *
 * Weekly and monthly are period *totals*, so every day inside one week reports
 * that week's figure — the line holds a plateau and steps at the boundary. A
 * period still in progress totals the days that have actually happened.
 */
export function toChartPoints(analytics) {
  const weekByStart = new Map(analytics.weekly.map((week) => [week.week_start, week.views]))
  const monthByKey = new Map(analytics.monthly.map((month) => [month.month, month.views]))

  return analytics.daily.map((day) => ({
    date: day.date,
    daily: day.views,
    weekly: weekByStart.get(startOfWeek(day.date)) ?? 0,
    monthly: monthByKey.get(day.date.slice(0, 7)) ?? 0,
  }))
}

/**
 * The Monday of the week a calendar day falls in.
 *
 * Parsed as UTC because these are calendar days, not instants: the backend has
 * already resolved them in Tashkent time, and re-reading them in the browser's
 * zone is exactly how a date shifts by one. Monday-based to match both local
 * convention and PostgreSQL's `date_trunc('week')`.
 */
function startOfWeek(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}
