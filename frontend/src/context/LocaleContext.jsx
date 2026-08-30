import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import uz from '../locales/uz'
import ru from '../locales/ru'
import en from '../locales/en'
import { DEFAULT_LOCALE } from '../locales/languages'
import { useSiteSettings } from './SiteSettingsContext'

const TRANSLATIONS = { uz, ru, en }
const STORAGE_KEY = 'renthouse_locale'

const LocaleContext = createContext(null)

function interpolate(template, params) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`,
  )
}

function readStoredLocale() {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored && TRANSLATIONS[stored] ? stored : null
}

export function LocaleProvider({ children }) {
  // Null until somebody chooses: the site's own default then applies, and a
  // visitor who has chosen keeps their choice.
  const [chosen, setLocaleState] = useState(readStoredLocale)
  const { settings } = useSiteSettings()

  // The owner sets which language the site opens in. It is applied only where
  // nobody has expressed a preference — changing a system default must never
  // reach in and change what a person already decided for themselves.
  const siteDefault = TRANSLATIONS[settings.default_language]
    ? settings.default_language
    : DEFAULT_LOCALE
  const locale = chosen ?? siteDefault

  const setLocale = useCallback((nextLocale) => {
    if (!TRANSLATIONS[nextLocale]) return
    setLocaleState(nextLocale)
    window.localStorage.setItem(STORAGE_KEY, nextLocale)
  }, [])

  const t = useCallback(
    (key, params) => {
      const dict = TRANSLATIONS[locale] ?? TRANSLATIONS[DEFAULT_LOCALE]
      const template = dict[key] ?? TRANSLATIONS[DEFAULT_LOCALE][key] ?? key
      return interpolate(template, params)
    },
    [locale],
  )

  // The document says which language it is written in, for screen readers and
  // for hyphenation.
  useEffect(() => {
    document.documentElement.setAttribute('lang', locale)
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider')
  }
  return context
}
