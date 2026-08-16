import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import uz from '../locales/uz'
import ru from '../locales/ru'
import en from '../locales/en'
import { DEFAULT_LOCALE } from '../locales/languages'

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
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored && TRANSLATIONS[stored] ? stored : DEFAULT_LOCALE
}

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(readStoredLocale)

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
