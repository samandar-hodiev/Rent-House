import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { withRedirect } from '../utils/redirectTarget'
import { ROUTES } from '../routes/paths'

/**
 * The single way to gate an action that needs an account.
 *
 * Wrap the handler instead of scattering `if (!user) navigate('/login')` through
 * components — one place to change if the rule or the destination ever moves.
 *
 *   const requireAuth = useRequireAuth()
 *   <button onClick={requireAuth(() => toggleWishlist(id))}>
 *
 * A signed-in user runs the action. A signed-out one is sent to the login page
 * with the current location attached, so finishing the sign-in returns them to
 * exactly where they were rather than dropping them on a dashboard.
 *
 * While the session is still being restored the action does nothing at all: a
 * page load has a brief window where a perfectly valid token has not been
 * checked yet, and redirecting during it would eject a signed-in user.
 */
export function useRequireAuth() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(
    (action) =>
      (...args) => {
        if (isLoading) return undefined
        if (isAuthenticated) return action?.(...args)

        const here = `${location.pathname}${location.search}`
        navigate(withRedirect(ROUTES.login, here))
        return undefined
      },
    [isAuthenticated, isLoading, navigate, location.pathname, location.search],
  )
}

export default useRequireAuth
