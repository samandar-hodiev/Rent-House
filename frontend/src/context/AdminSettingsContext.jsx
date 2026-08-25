import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ADMIN_DEFAULT_LOCALE, ADMIN_TRANSLATIONS } from '../locales/admin'

// Its own keys, deliberately. The admin area's appearance and language belong
// to whoever administers the marketplace; the public site's belong to whoever
// is browsing it. Sharing a key would mean an administrator switching the
// dashboard to Russian also switched the shop window.
const THEME_KEY = 'renthouse_admin_theme'
const LOCALE_KEY = 'renthouse_admin_locale'
const ROLE_KEY = 'renthouse_admin_role'
const SIDEBAR_KEY = 'renthouse_admin_sidebar'

export const ADMIN_ROLE = { owner: 'owner', superAdmin: 'superAdmin' }

/**
 * Which sections the sidebar offers.
 *
 * One object, read by the sidebar and written by the owner's Sidebar control
 * page. The keys are the `id` of the matching entry in `ADMIN_NAV`, so adding a
 * section to the navigation is the only place a new section has to be named.
 *
 * It describes the super admin's sidebar. The owner is offered every section
 * regardless, so that configuring somebody else's dashboard can never remove a
 * section from your own.
 *
 * Not every entry appears here. "Sidebar boshqaruvi" is the switch board itself
 * and is the owner's alone; "Panel sozlamalari" and "Chiqish" are how the
 * dashboard is configured and left. Those three never reach this object.
 */
export const DEFAULT_SIDEBAR = {
  dashboard: true,
  users: true,
  listings: true,
  chats: true,
  reports: true,
  analytics: true,
  notifications: true,
  adminManagement: false,
  auditLogs: false,
  settings: false,
}

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

// Stored as JSON, and merged over the defaults rather than trusted whole: a
// section added to the dashboard after somebody saved their configuration must
// arrive with its default rather than as `undefined`.
function readSidebar() {
  if (typeof window === 'undefined') return DEFAULT_SIDEBAR
  try {
    const stored = JSON.parse(window.localStorage.getItem(SIDEBAR_KEY) ?? 'null')
    if (!stored || typeof stored !== 'object') return DEFAULT_SIDEBAR
    const merged = { ...DEFAULT_SIDEBAR }
    for (const key of Object.keys(DEFAULT_SIDEBAR)) {
      if (typeof stored[key] === 'boolean') merged[key] = stored[key]
    }
    return merged
  } catch {
    return DEFAULT_SIDEBAR
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
  // Who is looking. There is no admin sign-in yet, so this is a preview of the
  // two roles rather than an identity — the header lets you switch between
  // them. When authentication arrives, this is the one line that changes: the
  // role comes from the session instead, and everything reading it stays put.
  const [role, setRoleState] = useState(() =>
    read(ROLE_KEY, Object.values(ADMIN_ROLE), ADMIN_ROLE.owner),
  )
  const [sidebar, setSidebarState] = useState(readSidebar)

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

  const setRole = useCallback((next) => {
    setRoleState(next)
    persist(ROLE_KEY, next)
  }, [])

  /** Back to the defaults above, in one step. */
  const resetSidebar = useCallback(() => {
    setSidebarState(DEFAULT_SIDEBAR)
    persist(SIDEBAR_KEY, JSON.stringify(DEFAULT_SIDEBAR))
  }, [])

  /** Show or hide one section. The owner's switch board is the only caller. */
  const setSidebarItem = useCallback((id, enabled) => {
    setSidebarState((current) => {
      const next = { ...current, [id]: enabled }
      persist(SIDEBAR_KEY, JSON.stringify(next))
      return next
    })
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
    () => ({
      theme, setTheme, locale, setLocale, t, role, setRole, sidebar, setSidebarItem, resetSidebar,
    }),
    [theme, setTheme, locale, setLocale, t, role, setRole, sidebar, setSidebarItem, resetSidebar],
  )

  return <AdminSettingsContext.Provider value={value}>{children}</AdminSettingsContext.Provider>
}

export function useAdmin() {
  const context = useContext(AdminSettingsContext)
  if (!context) throw new Error('useAdmin must be used inside AdminSettingsProvider')
  return context
}
