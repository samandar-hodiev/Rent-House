import { Link } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useAuth } from '../../context/AuthContext'
import { ROUTES } from '../../routes/paths'
import ThemeToggle from '../ThemeToggle'
import UserAvatar from './UserAvatar'

// Account-area header: no public search bar and no login/register buttons,
// since the user is already inside their account.
function DashboardHeader({ onOpenMenu }) {
  const { t } = useLocale()
  const { user } = useAuth()

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <div className="flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label={t('dashboard.menu')}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
          >
            <Menu aria-hidden="true" size={20} />
          </button>

          <Link
            to={ROUTES.home}
            className="shrink-0 text-lg font-semibold tracking-tight text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('brand.name')}
          </Link>
        </div>

        <div className="flex min-w-0 items-center gap-1">
          <ThemeToggle />
          <Link
            to={ROUTES.dashboardEditProfile}
            className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <UserAvatar name={user.name} />
            <span className="hidden truncate text-sm font-medium text-text-primary sm:block">
              {user.name}
            </span>
          </Link>
        </div>
      </div>
    </header>
  )
}

export default DashboardHeader
