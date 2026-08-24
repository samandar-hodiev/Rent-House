import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import UserAvatar from '../../components/dashboard/UserAvatar'
import {
  AdminCard, MockButton, StatusBadge, formatDate, formatDateTime,
} from '../../components/admin/adminUi'
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
  const { id } = useParams()
  const user = USERS.find((item) => item.id === id)

  if (!user) {
    return (
      <EmptyState
        title="User not found"
        description="This account does not exist, or the link is out of date."
      />
    )
  }

  const stats = [
    ['Total Listings', user.stats.totalListings],
    ['Active Listings', user.stats.activeListings],
    ['Closed Listings', user.stats.closedListings],
    ['Drafts', user.stats.drafts],
    ['Chats', user.stats.chats],
  ]

  return (
    <div className="flex flex-col gap-5">
      <Link
        to={ADMIN_ROUTES.users}
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft aria-hidden="true" size={15} />
        All Users
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
              {user.status === 'blocked' ? 'Unblock user' : 'Block user'}
            </MockButton>
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-border p-4 sm:grid-cols-4">
          <Field label="Phone" value={user.phone} />
          <Field label="Status" value={user.status} />
          <Field label="Registered" value={formatDate(user.registeredAt)} />
          <Field label="Last active" value={formatDateTime(user.lastActiveAt)} />
        </dl>
      </AdminCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminCard title="Statistics">
          <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-text-muted">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-text-primary">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </AdminCard>

        <AdminCard title="Activity">
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
