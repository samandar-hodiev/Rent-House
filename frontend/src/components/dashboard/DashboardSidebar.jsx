import { useNavigate } from 'react-router-dom'
import { Building2, LogOut, MessageSquare, PlusCircle, Settings, User } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { CURRENT_USER } from '../../data/currentUser'
import { ROUTES } from '../../routes/paths'
import DashboardNavItem from './DashboardNavItem'

const ICON_SIZE = 18

// Shared by the desktop sidebar and the mobile drawer so both always offer the
// same entries. `onNavigate` lets the drawer close itself after a tap.
export function DashboardNavList({ onNavigate }) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const unread = CURRENT_USER.stats.unreadMessages

  const handleLogout = () => {
    onNavigate?.()
    // UI only: there is no session to clear yet, so this just leaves the
    // account area. Replace with a real sign-out once auth exists.
    navigate(ROUTES.home)
  }

  return (
    <nav aria-label={t('dashboard.navLabel')} className="flex h-full flex-col gap-1">
      <DashboardNavItem
        to={ROUTES.createListing}
        icon={<PlusCircle aria-hidden="true" size={ICON_SIZE} />}
        label={t('dashboard.postListing')}
        variant="primary"
        onNavigate={onNavigate}
      />

      <div className="my-2 border-t border-border" />

      <DashboardNavItem
        to={ROUTES.dashboardProfile}
        icon={<User aria-hidden="true" size={ICON_SIZE} />}
        label={t('dashboard.profile')}
        onNavigate={onNavigate}
      />
      <DashboardNavItem
        to={ROUTES.dashboardListings}
        icon={<Building2 aria-hidden="true" size={ICON_SIZE} />}
        label={t('dashboard.listings')}
        onNavigate={onNavigate}
      />
      <DashboardNavItem
        to={ROUTES.dashboardChats}
        icon={<MessageSquare aria-hidden="true" size={ICON_SIZE} />}
        label={t('dashboard.chats')}
        badge={unread > 0 ? unread : null}
        onNavigate={onNavigate}
      />
      <DashboardNavItem
        to={ROUTES.dashboardSettings}
        icon={<Settings aria-hidden="true" size={ICON_SIZE} />}
        label={t('dashboard.settings')}
        onNavigate={onNavigate}
      />

      {/* Log out is deliberately separated from the navigation entries. */}
      <div className="mt-auto border-t border-border pt-2">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <LogOut aria-hidden="true" size={ICON_SIZE} />
          {t('dashboard.logout')}
        </button>
      </div>
    </nav>
  )
}

function DashboardSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 lg:block">
      <div className="sticky top-6 rounded-xl border border-border bg-surface p-3">
        <DashboardNavList />
      </div>
    </aside>
  )
}

export default DashboardSidebar
