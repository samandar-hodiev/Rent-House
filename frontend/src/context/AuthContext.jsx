import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CURRENT_USER } from '../data/currentUser'

// UI-only session flag. There is still no authentication, no API and no token —
// this exists purely so the public header can render its signed-in variant and
// so the dashboard's "Chiqish" has something to clear. Replace with the real
// session once auth is built.
const STORAGE_KEY = 'renthouse_session'

const AuthContext = createContext(null)

function readStoredSession() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'active'
  } catch {
    return false
  }
}

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(readStoredSession)
  const [user, setUser] = useState(CURRENT_USER)

  const persist = (active) => {
    try {
      if (active) window.localStorage.setItem(STORAGE_KEY, 'active')
      else window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Persistence is a convenience only.
    }
  }

  const signIn = useCallback(() => {
    setIsAuthenticated(true)
    persist(true)
  }, [])

  const signOut = useCallback(() => {
    setIsAuthenticated(false)
    persist(false)
  }, [])

  // Local-only profile edits, so the edit form can show its own changes.
  const updateUser = useCallback((patch) => {
    setUser((current) => {
      const next = { ...current, ...patch }
      next.name = [next.firstName, next.lastName].filter(Boolean).join(' ') || next.name
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ isAuthenticated, user, signIn, signOut, updateUser }),
    [isAuthenticated, user, signIn, signOut, updateUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
