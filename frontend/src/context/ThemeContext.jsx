import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'renthouse_theme'
const THEMES = ['light', 'dark', 'system']
// Light stays the default: the app shipped light-only, so only an explicitly
// stored preference may switch it.
export const DEFAULT_THEME = 'light'

const ThemeContext = createContext(null)

function readStoredTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return THEMES.includes(stored) ? stored : DEFAULT_THEME
  } catch {
    // Storage can be unavailable (private mode) — the app must still render.
    return DEFAULT_THEME
  }
}

function prefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme)
  // What is actually painted: 'system' resolves against the OS setting.
  const [resolvedTheme, setResolvedTheme] = useState(() =>
    readStoredTheme() === 'system' ? (prefersDark() ? 'dark' : 'light') : readStoredTheme(),
  )

  useEffect(() => {
    const apply = () => {
      const next = theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme
      setResolvedTheme(next)
      document.documentElement.classList.toggle('dark', next === 'dark')
    }

    apply()
    if (theme !== 'system') return undefined

    // Only follow the OS while the user has chosen "system".
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return
    setThemeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Persistence is a convenience, not required for the theme to apply.
    }
  }, [])

  const value = useMemo(() => ({ theme, setTheme, resolvedTheme }), [theme, setTheme, resolvedTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
