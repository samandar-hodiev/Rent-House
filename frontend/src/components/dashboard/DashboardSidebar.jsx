import { useState } from 'react'
import {
  Heart,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PlusCircle,
} from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import { ROUTES } from '../../routes/paths'
import DashboardNavItem from './DashboardNavItem'
import DashboardListingStatusNav from './DashboardListingStatusNav'
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
  // The same figure the header shows, so the two badges never disagree.
  const { unreadConversations } = useChat()

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
      {/* Replaces the old single "My listings" entry: the same page, reached
          through the state the reader is actually looking for. */}
      <DashboardListingStatusNav onNavigate={onNavigate} />
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
        badge={unreadConversations > 0 ? unreadConversations : null}
        onNavigate={onNavigate}
      />
      {/* The blocked list lives in chat's own sidebar now, under "Chat
          sozlamalari". It is a chat concern, and an entry for it among
          Dashboard, Listings and Saved made this column look like it held two
          different kinds of thing. */}
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

/**
 * Flush against the left edge of the viewport, full height below the header.
 *
 * Narrower below `2xl` than above it. At 16rem the column is comfortable on a
 * wide monitor and takes more than its share of a laptop screen, where the
 * space it costs comes straight out of the conversation list and the chat
 * beside it. 14rem still clears the longest label — "Mening e'lonlarim" — with
 * room to spare, so nothing truncates on the way down.
 */
function DashboardSidebar() {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-surface lg:block 2xl:w-64">
      <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-3">
        <DashboardNavList />
      </div>
    </aside>
  )
}

export default DashboardSidebar
