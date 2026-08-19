const LOCALE_TAG = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-GB' }

// Clock time for a single message bubble, e.g. "14:05".
export function formatMessageTime(isoString, locale) {
  return new Date(isoString).toLocaleTimeString(LOCALE_TAG[locale] ?? LOCALE_TAG.uz, {
    hour: '2-digit',
    minute: '2-digit',
  })
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
export function formatConversationTime(isoString, locale, t) {
  const sentAt = new Date(isoString)
  const now = new Date()
  if (isSameCalendarDay(sentAt, now)) return formatMessageTime(isoString, locale)

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameCalendarDay(sentAt, yesterday)) return t('chat.yesterday')

  return sentAt.toLocaleDateString(LOCALE_TAG[locale] ?? LOCALE_TAG.uz, {
    day: '2-digit',
    month: '2-digit',
  })
}
