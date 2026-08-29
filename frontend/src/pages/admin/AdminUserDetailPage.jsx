import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Users } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import UserAvatar from '../../components/dashboard/UserAvatar'
import { AdminCard, StatusBadge, useAdminFormat } from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { fetchUser } from '../../services/adminApi'
import { ADMIN_ROUTES } from '../../routes/adminPaths'

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-text-primary">{children}</dd>
    </div>
  )
}

/**
 * One marketplace account.
 *
 * Every figure is counted by the database for this account alone. What is shown
 * is what the database actually records — there is no invented activity feed
 * here, because nothing logs a general activity stream. The block history is
 * real, and it is the honest version of the same idea: every time this account
 * was blocked, why, by whom, and whether it was released.
 */
function AdminUserDetailPage() {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const { formatDate, formatDateTime, formatNumber } = useAdminFormat()
  const { id } = useParams()

  const [user, setUser] = useState(null)
  const [state, setState] = useState('loading')

  const load = useCallback(
    async (signal) => {
      setState('loading')
      try {
        setUser(await fetchUser(id, { token, signal }))
        setState('ready')
      } catch (error) {
        if (error?.name === 'AbortError') return
        setState(error?.status === 404 ? 'missing' : 'error')
      }
    },
    [id, token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (state === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 aria-hidden="true" size={22} className="animate-spin text-text-muted" />
      </div>
    )
  }
  if (state !== 'ready') {
    return (
      <EmptyState
        icon={<Users aria-hidden="true" size={28} />}
        title={t(state === 'missing' ? 'users.notFound' : 'users.loadFailed')}
        description={t(state === 'missing' ? 'users.notFoundHint' : 'login.errorNetwork')}
        actionLabel={state === 'error' ? t('analytics.retry') : undefined}
        onAction={state === 'error' ? () => load() : undefined}
      />
    )
  }

  const stats = [
    ['users.totalListings', user.stats.totalListings],
    ['users.activeListings', user.stats.activeListings],
    ['users.closedListings', user.stats.closedListings],
    ['users.drafts', user.stats.draftListings],
    ['users.chats', user.stats.chats],
    ['stat.favorites', user.stats.saves],
  ]

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Link
        to={ADMIN_ROUTES.users}
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft aria-hidden="true" size={15} />
        {t('nav.allUsers')}
      </Link>

      <AdminCard>
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <UserAvatar name={user.name} src={user.avatarUrl} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-text-primary">{user.name}</h1>
              <p className="mt-0.5 truncate text-sm text-text-muted">{user.email ?? '—'}</p>
              <span className="mt-2 inline-block">
                <StatusBadge status={user.status} />
              </span>
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-border p-4 sm:grid-cols-3">
          <Field label={t('table.phone')}>{user.phone ?? '—'}</Field>
          <Field label={t('table.registered')}>{formatDate(user.registeredAt)}</Field>
          <Field label={t('table.listings')}>{formatNumber(user.listings)}</Field>
        </dl>
      </AdminCard>

      <AdminCard title={t('users.statistics')}>
        <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
          {stats.map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs text-text-muted">{t(key)}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">
                {formatNumber(value)}
              </dd>
            </div>
          ))}
        </dl>
      </AdminCard>

      {/* The real record, not an invented feed. An account that was never
          blocked says so rather than showing a made-up history. */}
      <AdminCard title={t('users.blockHistory')}>
        {user.blockHistory.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">{t('users.neverBlocked')}</p>
        ) : (
          <ol className="flex flex-col">
            {user.blockHistory.map((record) => (
              <li
                key={record.blockedAt}
                className="flex flex-col gap-1 border-b border-border p-4 last:border-0"
              >
                <span className="text-sm text-text-primary">{record.reason}</span>
                <span className="text-[11px] text-text-muted">
                  {t('users.blockedOn', {
                    at: formatDateTime(record.blockedAt),
                    name: record.blockedByName ?? t('audit.unknownDeleter'),
                  })}
                </span>
                {record.unblockedAt ? (
                  <span className="text-[11px] text-primary-hover dark:text-primary">
                    {t('users.unblockedOn', {
                      at: formatDateTime(record.unblockedAt),
                      name: record.unblockedByName ?? t('audit.unknownDeleter'),
                    })}
                  </span>
                ) : (
                  <span className="text-[11px] text-error">{t('users.stillBlocked')}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </AdminCard>
    </div>
  )
}

export default AdminUserDetailPage
