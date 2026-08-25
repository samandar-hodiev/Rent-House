import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import UserAvatar from '../../components/dashboard/UserAvatar'
import { AdminCard, MockButton, StatusBadge, useAdminFormat } from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { USERS } from '../../mock/admin'
import { ADMIN_ROUTES } from '../../routes/adminPaths'

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-text-primary">{value}</dd>
    </div>
  )
}

function AdminUserDetailPage() {
  const { t } = useAdmin()
  const { formatDate, formatDateTime } = useAdminFormat()
  const { id } = useParams()
  const user = USERS.find((item) => item.id === id)

  if (!user) {
    return (
      <EmptyState
        title={t('users.notFound')}
        description={t('users.notFoundHint')}
      />
    )
  }

  const stats = [
    ['users.totalListings', user.stats.totalListings],
    ['users.activeListings', user.stats.activeListings],
    ['users.closedListings', user.stats.closedListings],
    ['users.drafts', user.stats.drafts],
    ['users.chats', user.stats.chats],
  ]

  return (
    <div className="flex flex-col gap-5">
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
            <UserAvatar name={user.name} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-text-primary">{user.name}</h1>
              <p className="mt-0.5 truncate text-sm text-text-muted">{user.email}</p>
              <span className="mt-2 inline-block">
                <StatusBadge status={user.status} />
              </span>
            </div>
          </div>
          <span className="flex shrink-0 gap-1.5">
            <MockButton tone="danger">
              {t(user.status === 'blocked' ? 'users.unblockUser' : 'users.blockUser')}
            </MockButton>
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-border p-4 sm:grid-cols-4">
          <Field label={t('table.phone')} value={user.phone} />
          <Field label={t('table.status')} value={t(`status.${user.status}`)} />
          <Field label={t('table.registered')} value={formatDate(user.registeredAt)} />
          <Field label={t('users.lastActive')} value={formatDateTime(user.lastActiveAt)} />
        </dl>
      </AdminCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminCard title={t('users.statistics')}>
          <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
            {stats.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-text-muted">{t(key)}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </AdminCard>

        <AdminCard title={t('users.activity')}>
          <ol className="flex flex-col gap-3 p-4">
            {user.timeline.map((entry) => (
              <li key={entry.at} className="flex gap-3">
                <span className="w-12 shrink-0 tabular-nums text-xs text-text-muted">
                  {entry.at}
                </span>
                {/* A rule and a dot, so the entries read as one sequence
                    rather than as four unrelated lines. */}
                <span className="relative flex-1 border-l border-border pb-1 pl-4">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[3px] top-1.5 size-1.5 rounded-full bg-primary"
                  />
                  <span className="text-sm text-text-secondary">{entry.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </AdminCard>
      </div>
    </div>
  )
}

export default AdminUserDetailPage
