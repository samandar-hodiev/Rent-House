import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ADMIN_DEFAULT_LOCALE, ADMIN_TRANSLATIONS } from '../locales/admin'
import { ADMIN_AUTH_STATUS, useAdminAuth } from './AdminAuthContext'
import { fetchSidebarSections, saveSidebarSections } from '../services/adminApi'

// Its own keys, deliberately. The admin area's appearance and language belong
// to whoever administers the marketplace; the public site's belong to whoever
// is browsing it. Sharing a key would mean an administrator switching the
// dashboard to Russian also switched the shop window.
// Appearance and language are this browser's preference and stay local. The
// role and the sidebar configuration are not preferences — they are what the
// server says this account is and may see — so neither is stored here.
const THEME_KEY = 'renthouse_admin_theme'
const LOCALE_KEY = 'renthouse_admin_locale'

/**
 * Every role an admin can hold, in one place.
 *
 * The header shows whichever the current admin has — there is no role name
 * written into the interface anywhere. Only the owner is treated differently by
 * the sidebar; everyone else is offered whatever the owner configured, so a
 * role added here needs no other change to behave correctly.
 *
 * These are the values the `admins.role` column holds, so the id travelling
 * from the database to the header never changes shape on the way. The display
 * names live in the dictionary, one entry each.
 */
export const ADMIN_ROLE = {
  owner: 'owner',
  superAdmin: 'super_admin',
}

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

// Merged over the defaults rather than trusted whole: a section added to the
// dashboard after a configuration was saved must arrive with its default rather
// than as `undefined`.
function mergeSections(stored) {
  const merged = { ...DEFAULT_SIDEBAR }
  if (!stored || typeof stored !== 'object') return merged
  for (const key of Object.keys(DEFAULT_SIDEBAR)) {
    if (typeof stored[key] === 'boolean') merged[key] = stored[key]
  }
  return merged
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
  // Who is looking, from the session — never from the client. A role kept in
  // the browser would be a role the browser could edit.
  const { status, token, role } = useAdminAuth()
  const [sidebar, setSidebarState] = useState(DEFAULT_SIDEBAR)

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

  // The configuration comes from the server, so every administrator sees the
  // one the owner set rather than whatever their own browser remembers.
  useEffect(() => {
    if (status !== ADMIN_AUTH_STATUS.authenticated || !token) return undefined

    const controller = new AbortController()
    let cancelled = false
    fetchSidebarSections({ token, signal: controller.signal })
      .then((sections) => {
        if (!cancelled) setSidebarState(mergeSections(sections))
      })
      .catch(() => {
        // The defaults stand. Better a working sidebar than an empty one.
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [status, token])

  /**
   * Writes a configuration and keeps the screen honest about the result.
   *
   * Applied at once so a switch responds to the tap, then reconciled with what
   * the server actually stored. If the write is refused — a super admin who got
   * to the page somehow, a lost connection — the switch goes back, because
   * showing it on while the server has it off would be a lie.
   */
  const writeSections = useCallback(
    async (next) => {
      const previous = sidebar
      setSidebarState(next)
      try {
        const saved = await saveSidebarSections(next, { token })
        setSidebarState(mergeSections(saved))
        return true
      } catch {
        setSidebarState(previous)
        return false
      }
    },
    [sidebar, token],
  )

  /** Show or hide one section. The owner's switch board is the only caller. */
  const setSidebarItem = useCallback(
    (id, enabled) => writeSections({ ...sidebar, [id]: enabled }),
    [sidebar, writeSections],
  )

  /** Back to the defaults above, in one step. */
  const resetSidebar = useCallback(() => writeSections(DEFAULT_SIDEBAR), [writeSections])

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

  // Resolved once, here, so every place that shows the role shows the same
  // words. Nothing downstream decides what a role is called.
  const roleLabel = role ? t(`role.${role}`) : ''

  const value = useMemo(
    () => ({
      theme, setTheme, locale, setLocale, t,
      role, roleLabel, sidebar, setSidebarItem, resetSidebar,
    }),
    [theme, setTheme, locale, setLocale, t,
      role, roleLabel, sidebar, setSidebarItem, resetSidebar],
  )

  return <AdminSettingsContext.Provider value={value}>{children}</AdminSettingsContext.Provider>
}

export function useAdmin() {
  const context = useContext(AdminSettingsContext)
  if (!context) throw new Error('useAdmin must be used inside AdminSettingsProvider')
  return context
}
