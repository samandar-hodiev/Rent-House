import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, setSessionRenewer } from '../services/apiClient'
import { fetchCurrentUser, logout as logoutRequest, refreshSession } from '../services/authApi'

// A session is two tokens. The access token is short-lived and sent with every
// request; the refresh token is long-lived, kept for renewing it, and is what
// signing out revokes on the server. Both live in localStorage so a reload
// keeps the user signed in; nothing else about the account is persisted.
const TOKEN_KEY = 'renthouse_token'
const REFRESH_KEY = 'renthouse_refresh'

// Session states. `loading` matters: on first paint the app does not yet know
// whether the stored token is still good, and rendering a signed-out header for
// a moment would make every reload flicker.
export const AUTH_STATUS = {
  loading: 'loading',
  authenticated: 'authenticated',
  unauthenticated: 'unauthenticated',
}

const AuthContext = createContext(null)

function readStoredToken() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function readStoredRefresh() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

function persistToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private-browsing mode can refuse writes; the session then lasts as long
    // as the tab, which is a degraded experience rather than a broken one.
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
 * Maps the API's user onto the shape the UI already uses.
 *
 * The backend speaks snake_case and leaves whichever contact was not verified
 * as null; the components expect camelCase and a display name. Doing the
 * translation here means the API contract can change without touching them.
 *
 */
export function toUiUser(apiUser) {
  const firstName = apiUser.first_name ?? ''
  const lastName = apiUser.last_name ?? ''

  return {
    id: apiUser.id,
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(' '),
    email: apiUser.email ?? '',
    phone: apiUser.phone ?? '',
    avatarUrl: apiUser.avatar_url ?? null,
    language: apiUser.language ?? 'uz',
    theme: apiUser.theme ?? 'light',
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readStoredToken)
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() =>
    readStoredToken() ? AUTH_STATUS.loading : AUTH_STATUS.unauthenticated,
  )

  const signIn = useCallback((accessToken, apiUser, refreshToken) => {
    persistToken(accessToken)
    persistRefresh(refreshToken ?? null)
    setToken(accessToken)
    setUser(toUiUser(apiUser))
    setStatus(AUTH_STATUS.authenticated)
  }, [])

  /** Forgets the session here. `signOut` also tells the server about it. */
  const forget = useCallback(() => {
    persistToken(null)
    persistRefresh(null)
    setToken(null)
    setUser(null)
    setStatus(AUTH_STATUS.unauthenticated)
  }, [])

  const signOut = useCallback(async () => {
    const refreshToken = readStoredRefresh()
    // Cleared first, and the server told afterwards: signing out must not
    // depend on the network. A request that fails leaves a session the server
    // still thinks is open, which the refresh token's own expiry ends — far
    // better than a sign-out button that does nothing when the API is down.
    forget()
    if (!refreshToken) return
    try {
      await logoutRequest(refreshToken)
    } catch {
      // Already reported above by clearing; nothing here to show the reader.
    }
  }, [forget])

  /**
   * Exchanges the refresh token for a new pair.
   *
   * One in flight at a time: several requests failing with 401 at once must
   * produce one renewal, not one each — the server rotates the token, so the
   * second would be presenting one that was just revoked and would end the
   * session it was trying to save.
   */
  const refreshing = useRef(null)
  const renew = useCallback(async () => {
    const refreshToken = readStoredRefresh()
    if (!refreshToken) return null

    if (!refreshing.current) {
      refreshing.current = refreshSession(refreshToken)
        .then((data) => {
          persistToken(data.access_token)
          persistRefresh(data.refresh_token ?? null)
          setToken(data.access_token)
          if (data.user) setUser(toUiUser(data.user))
          setStatus(AUTH_STATUS.authenticated)
          return data.access_token
        })
        .catch(() => {
          // The session is over — expired, signed out elsewhere, or revoked.
          forget()
          return null
        })
        .finally(() => {
          refreshing.current = null
        })
    }
    return refreshing.current
  }, [forget])

  // Every request in the app renews through this one function, so a token that
  // expires mid-session is replaced rather than thrown at the reader as a
  // sign-out. Registered here because the auth context is what owns the tokens.
  useEffect(() => {
    setSessionRenewer(renew, 'user')
    return () => setSessionRenewer(null, 'user')
  }, [renew])

  // Restore the session on load: a stored token proves nothing on its own — it
  // may have expired or belong to a deleted account — so it is exchanged for
  // the current user before the app treats it as a session.
  useEffect(() => {
    if (!token) return undefined

    const controller = new AbortController()
    let cancelled = false

    fetchCurrentUser(token)
      .then((apiUser) => {
        if (cancelled) return
        setUser(toUiUser(apiUser))
        setStatus(AUTH_STATUS.authenticated)
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return

        // Only an explicit rejection proves the token is bad. A 401 means the
        // server looked at it and refused it, so it is discarded. Anything else
        // — the API being down, a 500, a proxy hiccup — says nothing about the
        // token, and throwing away a valid session over a transient fault would
        // sign the user out for no reason. In those cases the token is kept and
        // the next page load tries again.
        const rejected = error instanceof ApiError && error.status === 401
        if (!rejected) {
          setStatus(AUTH_STATUS.unauthenticated)
          return
        }

        // The access token was refused. That is what the refresh token is for:
        // it is the usual state after a few hours away, and signing the user
        // out here would make every short session end at the token's expiry.
        renew().then((renewed) => {
          if (cancelled || renewed) return
          setStatus(AUTH_STATUS.unauthenticated)
        })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token])

  /**
   * Replaces the signed-in account with what the server just returned.
   *
   * This is how a profile edit reaches the rest of the application: the header,
   * the chat, every set of initials and every avatar read from this one user
   * object, so saving the profile updates all of them without any of them
   * knowing the profile page exists.
   *
   * Takes the API shape rather than the UI shape, so callers hand over the
   * response untouched and the mapping stays in one place.
   */
  const applyUser = useCallback((apiUser) => {
    setUser(toUiUser(apiUser))
  }, [])

  const value = useMemo(
    () => ({
      status,
      isLoading: status === AUTH_STATUS.loading,
      isAuthenticated: status === AUTH_STATUS.authenticated,
      token,
      // Components read `user.name` and friends unconditionally; an empty
      // profile keeps them from having to null-check on every render.
      user: user ?? EMPTY_USER,
      signIn,
      signOut,
      renew,
      applyUser,
    }),
    [status, token, user, signIn, signOut, renew, applyUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

const EMPTY_USER = {
  id: null,
  firstName: '',
  lastName: '',
  name: '',
  email: '',
  phone: '',
  avatarUrl: null,
  language: 'uz',
  theme: 'light',
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
