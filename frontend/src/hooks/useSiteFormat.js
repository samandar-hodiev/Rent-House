import { useSiteSettings } from '../context/SiteSettingsContext'
import { useLocale } from '../context/LocaleContext'
import { formatDate, formatMessageTime } from '../utils/formatChatTime'

/**
 * Dates and clock times, written the way the marketplace is configured.
 *
 * One hook so every screen agrees. Without it the settings page could offer a
 * date format and a twelve-hour clock that nothing on the site ever read.
 */
export function useSiteFormat() {
  const { settings } = useSiteSettings()
  const { locale } = useLocale()

  return {
    formatTime: (iso) => formatMessageTime(iso, locale, settings.time_format),
    formatDate: (iso) => formatDate(iso, settings.date_format),
  }
}
