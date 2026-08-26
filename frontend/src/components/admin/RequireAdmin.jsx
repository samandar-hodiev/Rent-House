import { Loader2 } from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'
import { ADMIN_AUTH_STATUS, useAdminAuth } from '../../context/AdminAuthContext'
import { ADMIN_ROUTES } from '../../routes/adminPaths'

/**
 * The gate in front of every dashboard page.
 *
 * It is a convenience, not the security: the API refuses an unauthenticated
 * request whatever the browser renders. What this prevents is a signed-out
 * person reaching a screen that would only fill with errors — and it sends them
 * back to where they were once they have signed in.
 */
function RequireAdmin({ children }) {
  const { status } = useAdminAuth()
  const location = useLocation()

  // The stored token has not been checked yet. Showing the sign-in form here
  // would flash it on every reload for someone who is signed in.
  if (status === ADMIN_AUTH_STATUS.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 aria-hidden="true" size={22} className="animate-spin text-text-muted" />
        <span className="sr-only">…</span>
      </div>
    )
  }

  if (status !== ADMIN_AUTH_STATUS.authenticated) {
    return (
      <Navigate
        to={ADMIN_ROUTES.login}
        replace
        state={{ from: location.pathname + location.search }}
      />
    )
  }

  return children
}

export default RequireAdmin
