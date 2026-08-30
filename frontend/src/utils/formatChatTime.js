const LOCALE_TAG = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-GB' }

// Clock time for a single message bubble, e.g. "14:05" — or "2:05 PM" where the
// marketplace is configured for a twelve-hour clock.
//
// `timeFormat` is "24" or "12"; anything else keeps the twenty-four-hour clock,
// which is what this marketplace has always shown.
export function formatMessageTime(isoString, locale, timeFormat) {
  return new Date(isoString).toLocaleTimeString(LOCALE_TAG[locale] ?? LOCALE_TAG.uz, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12',
  })
}

/**
 * A full date, written the way the marketplace is configured to write them.
 *
 * Two formats, because those are the two the settings page offers: 31.12.2026
 * and 2026-12-31. Built by hand rather than by locale, so the answer is the
 * chosen format regardless of which language the reader is in — the point of
 * the setting is that every date on the site looks the same.
 */
export function formatDate(isoString, dateFormat) {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  return dateFormat === 'YYYY-MM-DD' ? `${year}-${month}-${day}` : `${day}.${month}.${year}`
}

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// Compact stamp for the conversation list: the clock today, "yesterday" the day
// before, and a short date beyond that — long relative strings ("3 kun oldin")
// would not fit next to a name.
export function formatConversationTime(isoString, locale, t, formats = {}) {
  const sentAt = new Date(isoString)
  const now = new Date()
  if (isSameCalendarDay(sentAt, now)) {
    return formatMessageTime(isoString, locale, formats.time)
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameCalendarDay(sentAt, yesterday)) return t('chat.yesterday')

  return sentAt.toLocaleDateString(LOCALE_TAG[locale] ?? LOCALE_TAG.uz, {
    day: '2-digit',
    month: '2-digit',
  })
}
