import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useAuth } from '../../context/AuthContext'
import { useSiteFormat } from '../../hooks/useSiteFormat'
import { fetchMyNotifications, markMyNotificationsRead } from '../../services/apartmentsApi'
import { ROUTES } from '../../routes/paths'

/**
 * What happened to this account's listings.
 *
 * Small and on the overview rather than a page of its own: for somebody letting
 * a flat there are only ever a handful of these, and a whole screen for four
 * lines would be a screen mostly of nothing.
 *
 * The card is absent entirely when there is nothing to say — an empty state
 * here would be furniture.
 */
function DashboardNotifications() {
  const { t } = useLocale()
  const { token } = useAuth()
  const { formatDate } = useSiteFormat()

  const [feed, setFeed] = useState({ notifications: [], unread: 0 })
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (signal) => {
      try {
        setFeed(await fetchMyNotifications({ token, signal, limit: 5 }))
      } catch {
        // A dashboard that cannot read its notifications still shows the rest.
      }
    },
    [token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (feed.notifications.length === 0) return null

  const readAll = async () => {
    setBusy(true)
    setFeed((current) => ({
      ...current,
      unread: 0,
      notifications: current.notifications.map((row) => ({ ...row, read: true })),
    }))
    try {
      await markMyNotificationsRead({ token })
    } catch {
      // The badge is stale until the next load; not worth interrupting for.
    }
    setBusy(false)
  }

  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Bell aria-hidden="true" size={15} className="text-text-muted" />
          {t('dashboard.notifications')}
          {feed.unread > 0 ? (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-medium text-white">
              {feed.unread}
            </span>
          ) : null}
        </h2>
        {feed.unread > 0 ? (
          <button
            type="button"
            onClick={readAll}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <CheckCheck aria-hidden="true" size={13} />
            {t('dashboard.markAllRead')}
          </button>
        ) : null}
      </header>

      <ul className="divide-y divide-border">
        {feed.notifications.map((notification) => {
          const line = (
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm text-text-primary">
                {t(`notification.${notification.type}`, {
                  title: notification.payload.title ?? '',
                  status: notification.payload.status
                    ? t(`listingStatus.${notification.payload.status}`)
                    : '',
                })}
              </span>
              <span className="mt-0.5 text-xs text-text-muted">
                {formatDate(notification.createdAt)}
              </span>
            </span>
          )

          return (
            <li key={notification.id}>
              {notification.entityType === 'listing' ? (
                <Link
                  to={ROUTES.dashboardListings}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                    notification.read ? '' : 'bg-primary-light/20'
                  }`}
                >
                  {line}
                </Link>
              ) : (
                <div className="flex items-start gap-3 px-4 py-3">{line}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default DashboardNotifications
