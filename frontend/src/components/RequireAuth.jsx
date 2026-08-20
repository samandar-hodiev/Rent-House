import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
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
    // `state` remembers where the user was headed; `replace` keeps the
    // protected URL out of history, so Back does not bounce them here again.
    return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

export default RequireAuth
