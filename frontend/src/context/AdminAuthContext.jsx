import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../services/apiClient'
import { fetchCurrentAdmin, login as loginRequest, logout as logoutRequest } from '../services/adminApi'

// Its own key, deliberately: an administrator's token and a visitor's are for
// different systems and must not be interchangeable. The backend refuses either
// at the other's endpoints, and storing them apart means the client never
// presents the wrong one in the first place.
const TOKEN_KEY = 'renthouse_admin_token'

// `loading` matters: on first paint the app does not yet know whether the
// stored token is still good, and rendering the sign-in form for a moment on
// every reload would make the dashboard flicker.
export const ADMIN_AUTH_STATUS = {
  loading: 'loading',
  authenticated: 'authenticated',
  unauthenticated: 'unauthenticated',
}

const AdminAuthContext = createContext(null)

function readToken() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function persistToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private browsing can refuse writes; the session then lasts for the tab.
  }
}

/**
 * The signed-in administrator.
 *
 * The token is the whole session. It is re-validated against the API on every
 * page load, so an account suspended or deleted since the token was issued is
 * signed out on the next reload rather than when the token happens to expire —
 * and the server refuses it in the meantime either way.
 */
export function AdminAuthProvider({ children }) {
  const [token, setToken] = useState(readToken)
  const [admin, setAdmin] = useState(null)
  const [status, setStatus] = useState(
    readToken() ? ADMIN_AUTH_STATUS.loading : ADMIN_AUTH_STATUS.unauthenticated,
  )

  const clear = useCallback(() => {
    persistToken(null)
    setToken(null)
    setAdmin(null)
    setStatus(ADMIN_AUTH_STATUS.unauthenticated)
  }, [])

  // Whether the stored token is still good, asked of the server rather than
  // assumed. Anything the server refuses ends the session; a network failure
  // does not, because the token may well still be valid.
  useEffect(() => {
    if (!token) {
      setStatus(ADMIN_AUTH_STATUS.unauthenticated)
      return undefined
    }

    const controller = new AbortController()
    let cancelled = false

    fetchCurrentAdmin({ token, signal: controller.signal })
      .then((current) => {
        if (cancelled) return
        setAdmin(current)
        setStatus(ADMIN_AUTH_STATUS.authenticated)
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return
        // A refusal is an answer: the token is spent, expired, or the account
        // is gone. A network error is not, so the session is left alone.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          clear()
          return
        }
        setStatus(ADMIN_AUTH_STATUS.unauthenticated)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token, clear])

  const signIn = useCallback(async ({ email, password }) => {
    const session = await loginRequest({ email, password })
    persistToken(session.token)
    setToken(session.token)
    setAdmin(session.admin)
    setStatus(ADMIN_AUTH_STATUS.authenticated)
    return session.admin
  }, [])

  const signOut = useCallback(async () => {
    // Told to the server first, so a denylist added later has something to act
    // on — but the local session ends either way, which is what the person
    // asked for.
    if (token) {
      try {
        await logoutRequest({ token })
      } catch {
        // Already invalid on the server, or unreachable. Neither is a reason
        // to stay signed in here.
      }
    }
    clear()
  }, [token, clear])

  /**
   * Replaces the account the app is showing, after the person edits it.
   *
   * The server has already stored it — this is the same record coming back, so
   * the header and the profile page agree without either refetching.
   */
  const updateAdmin = useCallback((next) => setAdmin(next), [])

  const value = useMemo(
    () => ({
      status,
      admin,
      token,
      role: admin?.role ?? null,
      isOwner: admin?.role === 'owner',
      signIn,
      signOut,
      updateAdmin,
      // For a page that learns mid-request that the session is over.
      endSession: clear,
    }),
    [status, admin, token, signIn, signOut, updateAdmin, clear],
  )

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext)
  if (!context) throw new Error('useAdminAuth must be used inside AdminAuthProvider')
  return context
}
