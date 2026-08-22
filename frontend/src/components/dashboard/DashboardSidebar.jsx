import { useState } from 'react'
import { Building2, Heart, LayoutDashboard, LogOut, MessageSquare, PlusCircle } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import { ROUTES } from '../../routes/paths'
import DashboardNavItem from './DashboardNavItem'
import DashboardSettingsMenu from './DashboardSettingsMenu'
import LogoutDialog from '../LogoutDialog'

const ICON_SIZE = 18

// Shared by the desktop sidebar and the mobile drawer so both always offer the
// same entries. `onNavigate` lets the drawer close itself after a tap.
export function DashboardNavList({ onNavigate }) {
  const { t } = useLocale()
  const { signOut } = useAuth()
  // Same source as the public header's chat icon, so opening a conversation
  // clears the badge in both places at once.
  const { unreadTotal } = useChat()

  // Asked first: Log out is the last item under a column of navigation, and a
  // slipped tap on it ends the session.
  const [confirmLogout, setConfirmLogout] = useState(false)

  const handleLogout = () => {
    setConfirmLogout(false)
    onNavigate?.()
    signOut()
    // A full navigation rather than the router's.
    //
    // `navigate()` runs inside a transition, so the location change is deferred
    // while clearing the session is urgent: RequireAuth re-renders at the old,
    // protected path with no session and wins the race, landing the user on
    // /login?redirect=… — inviting somebody who just deliberately left to sign
    // in again and come back.
    //
    // Reloading also tears down the socket and every cached context rather than
    // trusting each to clear itself, which is what signing out should mean.
    window.location.assign(ROUTES.home)
  }

  return (
    <nav aria-label={t('dashboard.navLabel')} className="flex h-full flex-col gap-1">
      {/* `end` so the overview is only highlighted on /dashboard itself and not
          on every nested section underneath it. */}
      <DashboardNavItem
        to={ROUTES.dashboard}
        end
        icon={<LayoutDashboard aria-hidden="true" size={ICON_SIZE} />}
        label={t('dashboard.overview')}
        onNavigate={onNavigate}
      />
      <DashboardNavItem
        to={ROUTES.createListing}
        icon={<PlusCircle aria-hidden="true" size={ICON_SIZE} />}
        label={t('dashboard.postListing')}
        onNavigate={onNavigate}
      />
      <DashboardNavItem
        to={ROUTES.dashboardListings}
        icon={<Building2 aria-hidden="true" size={ICON_SIZE} />}
        label={t('dashboard.listings')}
        onNavigate={onNavigate}
      />
      <DashboardNavItem
        to={ROUTES.dashboardSaved}
        icon={<Heart aria-hidden="true" size={ICON_SIZE} />}
        label={t('dashboard.saved')}
        onNavigate={onNavigate}
      />
      <DashboardNavItem
        to={ROUTES.dashboardChats}
        icon={<MessageSquare aria-hidden="true" size={ICON_SIZE} />}
        label={t('dashboard.chats')}
        badge={unreadTotal > 0 ? unreadTotal : null}
        onNavigate={onNavigate}
      />
      {/* `mt-auto` keeps Settings and Log out pinned to the very bottom of the
          column, with Log out last. Settings' popover opens upward, so it never
          covers or displaces Log out. */}
      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-2">
        {/* Settings opens a popover instead of navigating to a body section. */}
        <DashboardSettingsMenu onNavigate={onNavigate} />

        <button
          type="button"
          onClick={() => setConfirmLogout(true)}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <LogOut aria-hidden="true" size={ICON_SIZE} />
          {t('dashboard.logout')}
        </button>
      </div>

      {confirmLogout ? (
        <LogoutDialog onCancel={() => setConfirmLogout(false)} onConfirm={handleLogout} />
      ) : null}
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
