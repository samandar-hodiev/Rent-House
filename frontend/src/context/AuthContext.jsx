import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ApiError } from '../services/apiClient'
import { fetchCurrentUser } from '../services/authApi'
import { CURRENT_USER } from '../data/currentUser'

// The access token is the whole session. It lives in localStorage so a reload
// keeps the user signed in; nothing else about the account is persisted, and
// the token is re-validated against the API on every page load.
const TOKEN_KEY = 'renthouse_token'

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

function persistToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private-browsing mode can refuse writes; the session then lasts as long
    // as the tab, which is a degraded experience rather than a broken one.
  }
}

/**
 * Maps the API's user onto the shape the UI already uses.
 *
 * The backend speaks snake_case and leaves whichever contact was not verified
 * as null; the components expect camelCase and a display name. Doing the
 * translation here means the API contract can change without touching them.
 *
 * `stats` has no endpoint yet, so the placeholder counts are kept — they are
 * the same numbers the dashboard showed before the API existed, and they are
 * clearly marked here as the one thing still mocked.
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
    stats: CURRENT_USER.stats,
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readStoredToken)
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() =>
    readStoredToken() ? AUTH_STATUS.loading : AUTH_STATUS.unauthenticated,
  )

  const signIn = useCallback((accessToken, apiUser) => {
    persistToken(accessToken)
    setToken(accessToken)
    setUser(toUiUser(apiUser))
    setStatus(AUTH_STATUS.authenticated)
  }, [])

  const signOut = useCallback(() => {
    persistToken(null)
    setToken(null)
    setUser(null)
    setStatus(AUTH_STATUS.unauthenticated)
  }, [])

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
        if (rejected) {
          persistToken(null)
          setToken(null)
          setUser(null)
        }
        setStatus(AUTH_STATUS.unauthenticated)
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
      applyUser,
    }),
    [status, token, user, signIn, signOut, applyUser],
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
  stats: CURRENT_USER.stats,
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
