import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ADMIN_DEFAULT_LOCALE, ADMIN_TRANSLATIONS } from '../locales/admin'

// Its own keys, deliberately. The admin area's appearance and language belong
// to whoever administers the marketplace; the public site's belong to whoever
// is browsing it. Sharing a key would mean an administrator switching the
// dashboard to Russian also switched the shop window.
const THEME_KEY = 'renthouse_admin_theme'
const LOCALE_KEY = 'renthouse_admin_locale'

const AdminSettingsContext = createContext(null)

function read(key, allowed, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const stored = window.localStorage.getItem(key)
    return allowed.includes(stored) ? stored : fallback
  } catch {
    return fallback
  }
}

function interpolate(template, params) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`,
  )
}

/**
 * The admin dashboard's own theme and language.
 *
 * Neither reaches the public site: the theme is applied as a class on the admin
 * layout's own root — see `.rh-dark` / `.rh-light` in index.css — rather than on
 * <html>, and the strings come from a dictionary only the admin area reads.
 */
export function AdminSettingsProvider({ children }) {
  const [theme, setThemeState] = useState(() => read(THEME_KEY, ['light', 'dark'], 'light'))
  const [locale, setLocaleState] = useState(() =>
    read(LOCALE_KEY, Object.keys(ADMIN_TRANSLATIONS), ADMIN_DEFAULT_LOCALE),
  )

  const persist = (key, value) => {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Private browsing can refuse writes; the choice then lasts for the tab.
    }
  }

  const setTheme = useCallback((next) => {
    setThemeState(next)
    persist(THEME_KEY, next)
  }, [])

  const setLocale = useCallback((next) => {
    setLocaleState(next)
    persist(LOCALE_KEY, next)
  }, [])

  // The admin area is a document of its own as far as language is concerned, so
  // its subtree is marked with the language it is actually written in. Screen
  // readers and hyphenation both read this.
  useEffect(() => {
    const root = document.getElementById('admin-root')
    if (root) root.setAttribute('lang', locale)
  }, [locale])

  const t = useCallback(
    (key, params) => {
      const dictionary = ADMIN_TRANSLATIONS[locale] ?? ADMIN_TRANSLATIONS[ADMIN_DEFAULT_LOCALE]
      // Falls back to English rather than to the key itself: a missing
      // translation should read as a sentence in the wrong language, not as
      // `page.users.title`.
      const template = dictionary[key] ?? ADMIN_TRANSLATIONS.en[key] ?? key
      return interpolate(template, params)
    },
    [locale],
  )

  const value = useMemo(
    () => ({ theme, setTheme, locale, setLocale, t }),
    [theme, setTheme, locale, setLocale, t],
  )

  return <AdminSettingsContext.Provider value={value}>{children}</AdminSettingsContext.Provider>
}

export function useAdmin() {
  const context = useContext(AdminSettingsContext)
  if (!context) throw new Error('useAdmin must be used inside AdminSettingsProvider')
  return context
}
