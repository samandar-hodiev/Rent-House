import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, setSessionRenewer } from '../services/apiClient'
import {
  fetchCurrentAdmin,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
  toAdmin,
} from '../services/adminApi'

// Its own keys, deliberately: an administrator's tokens and a visitor's are for
// different systems and must not be interchangeable. The backend refuses either
// at the other's endpoints, and storing them apart means the client never
// presents the wrong one in the first place.
const TOKEN_KEY = 'renthouse_admin_token'
const REFRESH_KEY = 'renthouse_admin_refresh'

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

function readRefresh() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

function persistRefresh(token) {
  try {
    if (token) window.localStorage.setItem(REFRESH_KEY, token)
    else window.localStorage.removeItem(REFRESH_KEY)
  } catch {
    // As above: the tab keeps working, the next one starts signed out.
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
    persistRefresh(null)
    setToken(null)
    setAdmin(null)
    setStatus(ADMIN_AUTH_STATUS.unauthenticated)
  }, [])

  /**
   * Exchanges the refresh token for a new pair — see AuthContext.renew, which
   * this mirrors. One in flight at a time for the same reason: several
   * requests failing with 401 at once must produce one renewal, since the
   * server rotates the token and a second renewal would present one the first
   * already spent.
   */
  const refreshing = useRef(null)
  const renew = useCallback(async () => {
    const refreshToken = readRefresh()
    if (!refreshToken) return null

    if (!refreshing.current) {
      refreshing.current = refreshSession(refreshToken)
        .then((data) => {
          persistToken(data.access_token)
          persistRefresh(data.refresh_token ?? null)
          setToken(data.access_token)
          if (data.admin) setAdmin(toAdmin(data.admin))
          setStatus(ADMIN_AUTH_STATUS.authenticated)
          return data.access_token
        })
        .catch(() => {
          clear()
          return null
        })
        .finally(() => {
          refreshing.current = null
        })
    }
    return refreshing.current
  }, [clear])

  // Every admin request renews through this, so a token that expires mid-
  // session is replaced rather than thrown at the reader as a sign-out. Its
  // own slot in the client: see setSessionRenewer for why the marketplace's
  // renewer must not be the one called here.
  useEffect(() => {
    setSessionRenewer(renew, 'admin')
    return () => setSessionRenewer(null, 'admin')
  }, [renew])

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

        // Only a 401 proves the access token itself is bad — and that is what
        // the refresh token is for, the same way the marketplace's session
        // renews after a few hours away rather than signing the reader out.
        const rejected = error instanceof ApiError && error.status === 401
        if (!rejected) {
          // Any other refusal (403, 404 — the account is gone or blocked) is
          // an answer a renewed token would get again, so the session ends.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            clear()
            return
          }
          setStatus(ADMIN_AUTH_STATUS.unauthenticated)
          return
        }

        renew().then((renewed) => {
          if (cancelled || renewed) return
          setStatus(ADMIN_AUTH_STATUS.unauthenticated)
        })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token, clear, renew])

  const signIn = useCallback(async ({ email, password }) => {
    const session = await loginRequest({ email, password })
    persistToken(session.token)
    persistRefresh(session.refreshToken)
    setToken(session.token)
    setAdmin(session.admin)
    setStatus(ADMIN_AUTH_STATUS.authenticated)
    return session.admin
  }, [])

  const signOut = useCallback(async () => {
    const refreshToken = readRefresh()
    // Cleared first, and the server told afterwards: signing out must not
    // depend on the network — see AuthContext.signOut, which this mirrors.
    clear()
    if (!refreshToken) return
    try {
      await logoutRequest({ refreshToken })
    } catch {
      // Already invalid on the server, or unreachable. Neither is a reason to
      // stay signed in here.
    }
  }, [clear])

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
