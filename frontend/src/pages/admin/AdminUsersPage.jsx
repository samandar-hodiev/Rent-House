import { useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import UserAvatar from '../../components/dashboard/UserAvatar'
import {
  AdminCard, AdminTable, Cell, MockButton, PageHeading, Row, StatusBadge, ViewLink, formatDate,
} from '../../components/admin/adminUi'
import { USERS } from '../../mock/admin'
import { adminUserPath } from '../../routes/adminPaths'

const PER_PAGE = 8

function AdminUsersPage() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return USERS.filter((user) => {
      if (status !== 'all' && user.status !== status) return false
      if (!needle) return true
      return [user.name, user.email, user.phone].join(' ').toLowerCase().includes(needle)
    })
  }, [query, status])

  const pages = Math.max(1, Math.ceil(visible.length / PER_PAGE))
  // A filter that shortens the list can leave the reader on a page that no
  // longer exists, so the page is clamped rather than trusted.
  const current = Math.min(page, pages)
  const rows = visible.slice((current - 1) * PER_PAGE, current * PER_PAGE)

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title="All Users" description={`${USERS.length} registered accounts.`} />

      <AdminCard>
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder="Search by name, email or phone"
              aria-label="Search users"
              className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-text-primary placeholder:text-xs placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
            aria-label="Filter by status"
            className="h-9 shrink-0 rounded-md border border-border bg-surface px-2.5 text-sm text-text-primary focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        <AdminTable
          headers={['User', 'Email', 'Phone', 'Listings', 'Status', 'Registered', 'Actions']}
          empty={
            rows.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Users aria-hidden="true" size={28} />}
                  title="No users found"
                  description="Try a different search or clear the status filter."
                />
              </div>
            ) : null
          }
        >
          {rows.map((user) => (
            <Row key={user.id}>
              <Cell>
                <span className="flex min-w-0 items-center gap-2.5">
                  <UserAvatar name={user.name} />
                  <span className="min-w-0 truncate font-medium text-text-primary">{user.name}</span>
                </span>
              </Cell>
              <Cell className="text-text-secondary">{user.email}</Cell>
              <Cell className="whitespace-nowrap text-text-secondary">{user.phone}</Cell>
              <Cell className="tabular-nums text-text-secondary">{user.listings}</Cell>
              <Cell><StatusBadge status={user.status} /></Cell>
              <Cell className="whitespace-nowrap text-text-secondary">
                {formatDate(user.registeredAt)}
              </Cell>
              <Cell>
                <span className="flex items-center gap-1.5">
                  <ViewLink to={adminUserPath(user.id)} />
                  <MockButton tone="danger">
                    {user.status === 'blocked' ? 'Unblock' : 'Block'}
                  </MockButton>
                </span>
              </Cell>
            </Row>
          ))}
        </AdminTable>

        {rows.length > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
            <p className="text-xs text-text-muted">
              {(current - 1) * PER_PAGE + 1}–{Math.min(current * PER_PAGE, visible.length)} of{' '}
              {visible.length}
            </p>
            <span className="flex items-center gap-1.5">
              <MockButton onClick={() => setPage(Math.max(1, current - 1))}>Previous</MockButton>
              <span className="px-1 text-xs tabular-nums text-text-secondary">
                {current} / {pages}
              </span>
              <MockButton onClick={() => setPage(Math.min(pages, current + 1))}>Next</MockButton>
            </span>
          </div>
        ) : null}
      </AdminCard>
    </div>
  )
}

export default AdminUsersPage
