import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, Flag, Home, Loader2, UserPlus } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { AdminCard, MockButton, PageHeading, useAdminFormat } from '../../components/admin/adminUi'
import Pagination from '../../components/Pagination'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import {
  fetchNotifications, markAllNotificationsRead, markNotificationRead,
} from '../../services/adminApi'
import { ADMIN_ROUTES, adminListingPath, adminUserPath } from '../../routes/adminPaths'

const PER_PAGE = 20

// A mark per kind, so a feed can be skimmed rather than read.
const ICONS = {
  listing_pending: Home,
  report_created: Flag,
  user_registered: UserPlus,
}

const TINTS = {
  listing_pending: 'bg-warning/15 text-warning',
  report_created: 'bg-error/10 text-error',
  user_registered: 'bg-primary-light text-primary-hover dark:text-primary',
}

/** Where a notification leads, when it leads anywhere. */
function destination(notification) {
  switch (notification.entityType) {
    case 'listing':
      return notification.entityId ? adminListingPath(notification.entityId) : null
    case 'user':
      return notification.entityId ? adminUserPath(notification.entityId) : null
    case 'report':
      return ADMIN_ROUTES.reports
    default:
      return null
  }
}

/**
 * What has happened that an administrator should know about.
 *
 * This page said for a long time that nothing generated notifications, which
 * was true. Now a listing waiting for moderation, a complaint and — if the
 * owner asks for it — a new account each write one, and this is where they are
 * read. The sentence is rendered here from the type and the payload, so it
 * appears in whichever language the reader has chosen.
 */
function AdminNotificationsPage() {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const { formatDateTime } = useAdminFormat()

  const [page, setPage] = useState(1)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [data, setData] = useState({ notifications: [], unread: 0, total: 0, limit: PER_PAGE })
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    async (signal) => {
      setState('loading')
      try {
        setData(await fetchNotifications({
          unread: unreadOnly, page, limit: PER_PAGE, token, signal,
        }))
        setState('ready')
      } catch (error) {
        if (error?.name === 'AbortError') return
        setState(error?.status === 403 ? 'forbidden' : 'error')
      }
    },
    [unreadOnly, page, token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const open = async (notification) => {
    if (notification.read) return
    // Marked read where it is read. The list is patched rather than refetched
    // so the row does not jump out from under the pointer that clicked it.
    setData((current) => ({
      ...current,
      unread: Math.max(0, current.unread - 1),
      notifications: current.notifications.map((row) =>
        row.id === notification.id ? { ...row, read: true } : row),
    }))
    try {
      await markNotificationRead(notification.id, { token })
    } catch {
      // The badge is one number out until the next load; not worth a message.
    }
  }

  const readAll = async () => {
    setBusy(true)
    try {
      await markAllNotificationsRead({ token })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / (data.limit || PER_PAGE)))

  if (state === 'forbidden') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeading title={t('page.notifications.title')} />
        <EmptyState title={t('page.notifications.title')} description={t('admins.ownerOnly')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t('page.notifications.title')}
        description={
          data.unread > 0
            ? t('notifications.unreadCount', { count: data.unread })
            : t('notifications.allRead')
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <MockButton
              onClick={() => {
                setUnreadOnly((value) => !value)
                setPage(1)
              }}
              tone={unreadOnly ? 'primary' : 'neutral'}
            >
              {t('notifications.onlyUnread')}
            </MockButton>
            <MockButton onClick={readAll} disabled={busy || data.unread === 0}>
              <span className="flex items-center gap-1.5">
                <CheckCheck aria-hidden="true" size={13} />
                {t('notifications.markAllRead')}
              </span>
            </MockButton>
          </div>
        }
      />

      <AdminCard>
        {state === 'loading' ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 aria-hidden="true" size={20} className="animate-spin text-text-muted" />
          </div>
        ) : state === 'error' ? (
          <div className="p-4">
            <EmptyState
              icon={<Bell aria-hidden="true" size={28} />}
              title={t('notifications.loadFailed')}
              description={t('login.errorNetwork')}
              actionLabel={t('analytics.retry')}
              onAction={() => load()}
            />
          </div>
        ) : data.notifications.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Bell aria-hidden="true" size={28} />}
              title={t('empty.notifications')}
              description={
                unreadOnly ? t('notifications.emptyUnread') : t('notifications.emptyAll')
              }
            />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {data.notifications.map((notification) => {
                const Icon = ICONS[notification.type] ?? Bell
                const to = destination(notification)
                const body = (
                  <span className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
                        TINTS[notification.type] ?? 'bg-surface-secondary text-text-muted'
                      }`}
                    >
                      <Icon aria-hidden="true" size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-text-primary">
                        {t(`notification.${notification.type}`, {
                          title: notification.payload.title ?? '',
                          name: notification.payload.name ?? '',
                          reason: notification.payload.reason
                            ? t(`reportReason.${notification.payload.reason}`)
                            : '',
                        })}
                      </span>
                      <span className="mt-0.5 block text-xs text-text-muted">
                        {formatDateTime(notification.createdAt)}
                      </span>
                    </span>
                  </span>
                )

                return (
                  <li key={notification.id}>
                    {to ? (
                      <Link
                        to={to}
                        onClick={() => open(notification)}
                        className={`flex items-start gap-3 p-4 transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                          notification.read ? '' : 'bg-primary-light/20'
                        }`}
                      >
                        {body}
                        {notification.read ? null : (
                          <span
                            aria-label={t('notifications.unread')}
                            className="mt-2 size-2 shrink-0 rounded-full bg-primary"
                          />
                        )}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => open(notification)}
                        className={`flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                          notification.read ? '' : 'bg-primary-light/20'
                        }`}
                      >
                        {body}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>

            <div className="border-t border-border p-3">
              <Pagination page={page} pages={pages} onChange={setPage} />
            </div>
          </>
        )}
      </AdminCard>
    </div>
  )
}

export default AdminNotificationsPage
