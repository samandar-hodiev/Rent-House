import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { withRedirect } from '../utils/redirectTarget'
import { ROUTES } from '../routes/paths'

// Guards the account area.
//
// The `loading` state matters as much as the other two: on a reload the stored
// token has not been checked yet, and redirecting during that window would
// bounce a signed-in user to the login page every time they refresh.
function RequireAuth() {
  const { isLoading, isAuthenticated } = useAuth()
  const { t } = useLocale()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <p role="status" className="text-sm text-text-muted">
          {t('auth.checkingSession')}
        </p>
      </div>
    )
  }

  if (!isAuthenticated) {
    // The destination travels in the query string rather than in router
    // state, so it survives a refresh on the login page and is visible in the
    // URL. `withRedirect` rejects anything that is not an internal path.
    // `replace` keeps the protected URL out of history, so Back does not
    // bounce the user straight back here.
    const here = `${location.pathname}${location.search}`
    return <Navigate to={withRedirect(ROUTES.login, here)} replace />
  }

  return <Outlet />
}

export default RequireAuth
