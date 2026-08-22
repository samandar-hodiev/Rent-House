import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, LayoutDashboard, LogOut, MessageSquare } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { useLocale } from '../context/LocaleContext'
import { ROUTES } from '../routes/paths'
import {
  MOBILE_ICON_SIZE,
  mobileLogoutButtonClass,
  mobileMenuGroupClass,
  mobileNavLinkClass,
} from './headerMenuStyles'
import LogoutDialog from './LogoutDialog'
import UserAvatar from './dashboard/UserAvatar'

// Signed-in replacement for the public header's Kirish / Ro'yxatdan o'tish
// pair: a chat shortcut with an unread badge, plus the account entry point.
function AuthedHeaderActions({ variant = 'desktop', onNavigate }) {
  const { t } = useLocale()
  const { user, signOut } = useAuth()
  // Shared with the dashboard sidebar badge — see ChatContext.
  const { unreadTotal: unread } = useChat()

  // Same order as the dashboard sidebar's own log out, so the two behave
  // identically wherever the user reaches for it.
  // Same confirmation as the sidebar's, so reaching for Chiqish behaves
  // identically wherever it is found.
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

  if (variant === 'mobile') {
    // These rows carry the menu's navigation styling, not the auth buttons' —
    // they are destinations, and the one action here is Chiqish below.
    // The labels come from the `dashboard.*` namespace on purpose: each row
    // leads into the dashboard, and it should be named the same in both places.
    return (
      <>
        {/* The dashboard itself, which this menu did not offer — leaving the
            account sidebar, and everything only it links to, unreachable on a
            phone. */}
        <Link
          to={ROUTES.dashboard}
          onClick={onNavigate}
          className={mobileNavLinkClass({ isActive: false })}
        >
          <LayoutDashboard aria-hidden="true" size={MOBILE_ICON_SIZE} className="shrink-0" />
          <span className="truncate">{t('dashboard.overview')}</span>
        </Link>

        <Link
          to={ROUTES.dashboardChats}
          onClick={onNavigate}
          className={`${mobileNavLinkClass({ isActive: false })} justify-between`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <MessageSquare aria-hidden="true" size={MOBILE_ICON_SIZE} className="shrink-0" />
            <span className="truncate">{t('header.chats')}</span>
          </span>
          {unread > 0 ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
              {unread}
            </span>
          ) : null}
        </Link>

        <Link
          to={ROUTES.dashboardListings}
          onClick={onNavigate}
          className={mobileNavLinkClass({ isActive: false })}
        >
          <Building2 aria-hidden="true" size={MOBILE_ICON_SIZE} className="shrink-0" />
          <span className="truncate">{t('dashboard.listings')}</span>
        </Link>

        <Link
          to={ROUTES.dashboardEditProfile}
          onClick={onNavigate}
          className={mobileNavLinkClass({ isActive: false })}
        >
          <UserAvatar name={user.name} />
          <span className="truncate">{user.name}</span>
        </Link>

        {/* Separated exactly like the signed-out button group, so the menu has
            the same two-part shape in both states. */}
        <div className={mobileMenuGroupClass}>
          <button type="button" onClick={() => setConfirmLogout(true)} className={mobileLogoutButtonClass}>
            <LogOut aria-hidden="true" size={16} className="shrink-0" />
            {t('dashboard.logout')}
          </button>
        </div>

        {confirmLogout ? (
          <LogoutDialog onCancel={() => setConfirmLogout(false)} onConfirm={handleLogout} />
        ) : null}
      </>
    )
  }

  return (
    <>
      <Link
        to={ROUTES.dashboardChats}
        aria-label={t('header.chats')}
        title={t('header.chats')}
        className="relative flex size-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <MessageSquare aria-hidden="true" size={18} />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">
            {unread}
          </span>
        ) : null}
      </Link>

      <Link
        to={ROUTES.dashboardEditProfile}
        aria-label={t('header.account')}
        className="flex min-w-0 shrink-0 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <UserAvatar name={user.name} />
        <span className="truncate text-sm font-medium text-text-primary">{user.name}</span>
      </Link>
    </>
  )
}

export default AuthedHeaderActions
