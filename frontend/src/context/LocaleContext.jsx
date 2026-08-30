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

/**
 * What this browser last chose, and which site default it was choosing against.
 *
 * Both halves matter. A language picked from the header is that reader's, and
 * reloading must not undo it — but it was a choice made about one particular
 * site default, and when the owner changes that default the site is saying
 * something new. Without the second half a choice made once was permanent: the
 * owner could switch the marketplace to Russian and a reader who had ever
 * touched the selector would never see it, with nothing on screen to explain
 * why. Recording the default the choice was made against is what lets a later
 * change of it be heard.
 */
function readStoredChoice() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    // Older versions stored the bare code. Such a value has no idea which site
    // default it was answering, so it is treated as no choice at all and the
    // site's language applies again.
    if (!raw.startsWith('{')) return null

    const parsed = JSON.parse(raw)
    if (!TRANSLATIONS[parsed?.locale]) return null
    return { locale: parsed.locale, siteDefault: parsed.siteDefault ?? null }
  } catch {
    return null
  }
}

export function LocaleProvider({ children }) {
  const [choice, setChoice] = useState(readStoredChoice)
  const { settings, state } = useSiteSettings()

  // Which language the marketplace opens in, as its owner set it. Never a
  // literal in this file: an unknown code falls back to the project's own
  // default rather than to a language nobody configured.
  const siteDefault = TRANSLATIONS[settings.default_language]
    ? settings.default_language
    : DEFAULT_LOCALE

  // A choice still stands while it was made against the site default that is
  // in force. Until the configuration has actually been read, the stored
  // choice is honoured as-is — otherwise every page would open in the fallback
  // language for a moment and then jump.
  const settled = state !== 'loading'
  const choiceStands =
    choice !== null && (!settled || choice.siteDefault === siteDefault)
  const locale = choiceStands ? choice.locale : siteDefault

  // A choice the site default has moved past is dropped rather than kept
  // around: it would otherwise come back if the owner ever set that default
  // again, which is not something the reader asked for.
  useEffect(() => {
    if (!settled || choice === null || choice.siteDefault === siteDefault) return
    setChoice(null)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Private browsing can refuse writes; the value is ignored either way.
    }
  }, [settled, choice, siteDefault])

  const setLocale = useCallback(
    (nextLocale) => {
      if (!TRANSLATIONS[nextLocale]) return
      const next = { locale: nextLocale, siteDefault }
      setChoice(next)
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Private browsing can refuse; the choice then lasts for the tab.
      }
    },
    [siteDefault],
  )

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

  const value = useMemo(
    () => ({ locale, setLocale, t, siteDefault }),
    [locale, setLocale, t, siteDefault],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider')
  }
  return context
}
