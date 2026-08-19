import { useNavigate } from 'react-router-dom'
import { Building2, LogOut, MessageSquare, PlusCircle, User } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useAuth } from '../../context/AuthContext'
import { ROUTES } from '../../routes/paths'
import DashboardNavItem from './DashboardNavItem'
import DashboardSettingsMenu from './DashboardSettingsMenu'

const ICON_SIZE = 18

// Shared by the desktop sidebar and the mobile drawer so both always offer the
// same entries. `onNavigate` lets the drawer close itself after a tap.
export function DashboardNavList({ onNavigate }) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const unread = user.stats?.unreadMessages ?? 0

  const handleLogout = () => {
    onNavigate?.()
    // Clears the UI-only session flag; there is still no token or API call.
    signOut()
    navigate(ROUTES.home)
  }

  return (
    <nav aria-label={t('dashboard.navLabel')} className="flex h-full flex-col gap-1">
      <DashboardNavItem
        to={ROUTES.dashboardProfile}
        icon={<User aria-hidden="true" size={ICON_SIZE} />}
        label={t('dashboard.profile')}
        onNavigate={onNavigate}
      />
      <DashboardNavItem
        to={ROUTES.createListing}
        icon={<PlusCircle aria-hidden="true" size={ICON_SIZE} />}
        label={t('dashboard.postListing')}
        accent
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
      {/* `mt-auto` keeps Log out and Settings pinned to the very bottom of the
          column, with Log out directly above Settings. */}
      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-2">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <LogOut aria-hidden="true" size={ICON_SIZE} />
          {t('dashboard.logout')}
        </button>

        {/* Settings opens a popover instead of navigating to a body section. */}
        <DashboardSettingsMenu onNavigate={onNavigate} />
      </div>
    </nav>
  )
}

// Flush against the left edge of the viewport, full height below the header.
function DashboardSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
      <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-3">
        <DashboardNavList />
      </div>
    </aside>
  )
}

export default DashboardSidebar
