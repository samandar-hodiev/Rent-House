const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function formatPostedAt(isoString, t) {
  const postedAt = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - postedAt.getTime()

  const diffMinutes = Math.floor(diffMs / MINUTE_MS)
  const diffHours = Math.floor(diffMs / HOUR_MS)

  if (diffMinutes < 60) {
    return t('posted.minutesAgo', { count: Math.max(1, diffMinutes) })
  }

  if (diffHours < 6) {
    return t('posted.hoursAgo', { count: diffHours })
  }

  if (isSameCalendarDay(postedAt, now)) {
    return t('posted.today')
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameCalendarDay(postedAt, yesterday)) {
    return t('posted.yesterday')
  }

  const diffDays = Math.floor(diffHours / 24)
  return t('posted.daysAgo', { count: diffDays })
}
