import { Link } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { ROUTES } from '../routes/paths'
import UserAvatar from './dashboard/UserAvatar'

// Signed-in replacement for the public header's Kirish / Ro'yxatdan o'tish
// pair: a chat shortcut with an unread badge, plus the account entry point.
function AuthedHeaderActions({ variant = 'desktop', onNavigate }) {
  const { t } = useLocale()
  const { user } = useAuth()
  const unread = user.stats?.unreadMessages ?? 0

  if (variant === 'mobile') {
    return (
      <>
        <Link
          to={ROUTES.dashboardChats}
          onClick={onNavigate}
          className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex items-center gap-2">
            <MessageSquare aria-hidden="true" size={16} />
            {t('header.chats')}
          </span>
          {unread > 0 ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
              {unread}
            </span>
          ) : null}
        </Link>

        <Link
          to={ROUTES.dashboardProfile}
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <UserAvatar name={user.name} />
          <span className="truncate">{user.name}</span>
        </Link>
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
        to={ROUTES.dashboardProfile}
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
