// Human labels for the period a chart point covers.
//
// The tooltip must never show a raw timestamp, and each series covers a
// different span of time, so the same date reads differently depending on which
// series is being described:
//
//   daily    18 Avgust 2026
//   weekly   18–24 Avgust 2026        (17–23 Avgust when the week spans one month)
//   monthly  Avgust 2026
//
// Month names come from the locale dictionary (`month.1` … `month.12`) rather
// than `toLocaleDateString`, because the browser's Uzbek month names are
// inconsistent across engines and some fall back to English entirely.

const DAY_MS = 24 * 60 * 60 * 1000

// Parsed as UTC so a day never shifts under a timezone offset — these are
// calendar days, not instants.
function parseDay(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

const monthName = (t, date) => t(`month.${date.getUTCMonth() + 1}`)

// Monday-based, matching the week the analytics data is bucketed by.
function startOfWeek(date) {
  const start = new Date(date)
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))
  return start
}

function formatDay(t, date) {
  return `${date.getUTCDate()} ${monthName(t, date)} ${date.getUTCFullYear()}`
}

/**
 * Label for the week containing `date`.
 *
 * The month and year are not repeated when both ends share them — "18–24
 * Avgust 2026" rather than "18 Avgust 2026 – 24 Avgust 2026" — but they are
 * spelled out in full when the week straddles a boundary.
 */
function formatWeek(t, date) {
  const start = startOfWeek(date)
  const end = new Date(start.getTime() + 6 * DAY_MS)

  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${monthName(t, end)} ${end.getUTCFullYear()}`
  }
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${start.getUTCDate()} ${monthName(t, start)} – ${end.getUTCDate()} ${monthName(t, end)} ${end.getUTCFullYear()}`
  }
  return `${formatDay(t, start)} – ${formatDay(t, end)}`
}

/**
 * The label for one point, for the given series.
 *
 * `t` is the locale dictionary lookup, so the caller does not have to know
 * which language is active.
 */
export function formatPeriod(t, iso, seriesId) {
  const date = parseDay(iso)
  if (seriesId === 'weekly') return formatWeek(t, date)
  if (seriesId === 'monthly') return `${monthName(t, date)} ${date.getUTCFullYear()}`
  return formatDay(t, date)
}

/**
 * The heading shown when several series are described at once.
 *
 * Falls back to the day, because that is the point the reader is hovering and
 * the individual rows already name the period each figure covers.
 */
export function formatPointHeading(t, iso) {
  return formatDay(t, parseDay(iso))
}

/** Thousands separated with a space: 3 421. Same in all three locales. */
export function formatCount(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}
