import { useSiteSettings } from '../context/SiteSettingsContext'
import { useLocale } from '../context/LocaleContext'

/**
 * Where this marketplace is.
 *
 * Every listing line reads "Chilonzor, Toshkent" — the district from the row,
 * the city from here. The city used to be a translated constant, which meant a
 * marketplace configured for another city still said Tashkent on every card.
 *
 * The translation is the fallback rather than the source: it is what shows
 * before the configuration has been read, and it is still the right word in
 * each language for the default the settings ship with.
 */
export function useSiteLocation() {
  const { settings } = useSiteSettings()
  const { t } = useLocale()

  return {
    city: settings.default_city?.trim() || t('city.tashkent'),
    country: settings.default_country?.trim() || '',
  }
}
