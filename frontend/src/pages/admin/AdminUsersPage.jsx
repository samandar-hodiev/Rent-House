import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Search, Users } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import UserAvatar from '../../components/dashboard/UserAvatar'
import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog'
import {
  ADMIN_SELECT, ADMIN_SELECT_STYLE, AdminCard, AdminTable, Cell, MockButton, PageHeading,
  Row, StatusBadge, useAdminFormat,
} from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { fetchUsers, setUserStatus } from '../../services/adminApi'
import { useModalDialog } from '../../hooks/useModalDialog'

const PER_PAGE = 10

// How long to wait after the last keystroke before asking the server. Long
// enough that typing a name is one request rather than eight, short enough that
// it still feels like the list is following along.
const SEARCH_DEBOUNCE = 300

/**
 * Why an account was blocked, who did it, and when.
 *
 * Every value comes from the block record the API returned with the row — the
 * date and the time are two readings of one timestamp, so they cannot disagree.
 */
function BlockDetailsDialog({ user, onClose }) {
  const { t } = useAdmin()
  const dialogRef = useModalDialog(onClose)

  const host = document.getElementById('admin-root')
  if (!host) return null

  const at = user.blockedAt ? new Date(user.blockedAt) : null
  // Written out rather than left to the locale: Chromium formats uz-UZ dates in
  // ISO order, and an administrator reading "2026-08-26" where the rest of the
  // product says "26.08.2026" has to stop and work out which is which. A
  // timestamp on an audit record should read the same in every language.
  const pad = (value) => String(value).padStart(2, '0')
  const date = at ? `${pad(at.getDate())}.${pad(at.getMonth() + 1)}.${at.getFullYear()}` : null
  const time = at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : null

  const rows = [
    ['users.blockReason', user.blockReason],
    ['users.blockedBy', user.blockedBy],
    ['users.blockedDate', date],
    ['users.blockedTime', time],
  ]

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-details-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 focus:outline-none"
      >
        <h2 id="block-details-title" className="text-base font-semibold text-text-primary">
          {t('users.blockDetailsTitle')}
        </h2>
        {/* The account, not the person's display name — the name is already on
            the row this was opened from, and repeating it identifies nobody.
            RentHouse has no username: an account is registered with a phone or
            an email and that is what identifies it, so that is what is shown. */}
        <p className="mt-1 text-sm text-text-muted">{user.email ?? user.phone ?? user.name}</p>

        <dl className="mt-4 flex flex-col gap-3">
          {rows.map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs text-text-muted">{t(key)}</dt>
              <dd className="mt-0.5 text-sm text-text-primary">{value || '—'}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('action.close')}
          </button>
        </div>
      </div>
    </div>,
    host,
  )
}

/**
 * Marketplace accounts, from the database.
 *
 * Searching, filtering and paging are all query parameters: the server returns
 * one page and the totals, so the browser never holds every account in order to
 * show ten. Blocking and unblocking write through the API and the row then
 * shows what the server stored, not what the click hoped for.
 */
function AdminUsersPage() {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const { formatDate, formatNumber } = useAdminFormat()

  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)

  const [data, setData] = useState({ users: [], total: 0, page: 1, totalPages: 1 })
  const [state, setState] = useState('loading')
  const [confirming, setConfirming] = useState(null)
  // The account whose block is being read, which is a different question from
  // the account whose block is being changed.
  const [viewing, setViewing] = useState(null)
  const [reason, setReason] = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  // The search box runs ahead of the request it will cause.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE)
    return () => clearTimeout(timer)
  }, [query])

  // Bumped to force a reload after an action, without duplicating the fetch.
  const [reloads, setReloads] = useState(0)
  const firstLoad = useRef(true)

  const load = useCallback(
    async (signal) => {
      // Only the first load blanks the table. A search that narrows the list
      // should not flash an empty screen between keystrokes.
      if (firstLoad.current) setState('loading')
      try {
        const result = await fetchUsers({
          search,
          status: status === 'all' ? '' : status,
          page,
          limit: PER_PAGE,
          token,
          signal,
        })
        setData(result)
        setState('ready')
        firstLoad.current = false
      } catch (error) {
        if (error?.name === 'AbortError') return
        setState('error')
      }
    },
    [search, status, page, token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, reloads])

  const closeDialog = () => {
    setConfirming(null)
    setReason('')
    setReasonTouched(false)
    setActionError(null)
  }

  const apply = async () => {
    if (busy || !confirming) return
    const blocking = confirming.status !== 'blocked'

    // Checked here as well as by the disabled button: a form can be submitted
    // by keyboard before React has re-rendered the control.
    if (blocking && reason.trim().length < 3) {
      setReasonTouched(true)
      return
    }

    setBusy(true)
    setActionError(null)
    try {
      await setUserStatus(confirming.id, blocking ? 'blocked' : 'active', {
        reason: blocking ? reason.trim() : undefined,
        token,
      })
      closeDialog()
      // Refetched rather than patched in place: the filter may no longer match
      // this row, and the page it belongs on is the server's to decide.
      setReloads((n) => n + 1)
    } catch {
      setActionError(t('users.actionFailed'))
    }
    setBusy(false)
  }

  const from = data.total === 0 ? 0 : (data.page - 1) * PER_PAGE + 1
  const to = Math.min(data.page * PER_PAGE, data.total)

  return (
    // The column fills the page so the card, and the pagination pinned to its
    // foot, reach the bottom of the screen rather than stopping halfway.
    <div className="flex min-h-full flex-col gap-5">
      <PageHeading
        title={t('page.users.title')}
        description={t('page.users.description', { count: formatNumber(data.total) })}
      />

      <AdminCard className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('users.search')}
              aria-label={t('users.search')}
              className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-text-primary placeholder:text-xs placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
            aria-label={t('table.status')}
            className={ADMIN_SELECT}
            style={ADMIN_SELECT_STYLE}
          >
            <option value="all">{t('users.allStatuses')}</option>
            <option value="active">{t('users.statusActive')}</option>
            <option value="blocked">{t('users.statusBlocked')}</option>
          </select>
        </div>

        {state === 'loading' ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 aria-hidden="true" size={20} className="animate-spin text-text-muted" />
          </div>
        ) : state === 'error' ? (
          <div className="p-4">
            <EmptyState
              icon={<Users aria-hidden="true" size={28} />}
              title={t('users.loadFailed')}
              description={t('login.errorNetwork')}
            />
          </div>
        ) : (
          <AdminTable
            headers={[
              t('table.user'), t('table.email'), t('table.phone'), t('table.listings'),
              t('table.status'), t('table.registered'), t('table.actions'),
            ]}
            empty={
              data.users.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<Users aria-hidden="true" size={28} />}
                    title={t('users.notFound')}
                    description={t('users.notFoundHint')}
                  />
                </div>
              ) : null
            }
          >
            {data.users.map((user) => {
              const blocked = user.status === 'blocked'
              return (
                <Row key={user.id}>
                  <Cell>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <UserAvatar name={user.name} src={user.avatarUrl} />
                      <span className="min-w-0 truncate font-medium text-text-primary">
                        {user.name}
                      </span>
                    </span>
                  </Cell>
                  <Cell className="text-text-secondary">{user.email ?? '—'}</Cell>
                  <Cell className="whitespace-nowrap text-text-secondary">{user.phone ?? '—'}</Cell>
                  <Cell className="tabular-nums text-text-secondary">
                    {formatNumber(user.listings)}
                  </Cell>
                  <Cell><StatusBadge status={user.status} /></Cell>
                  <Cell className="whitespace-nowrap text-text-secondary">
                    {formatDate(user.registeredAt)}
                  </Cell>
                  <Cell>
                    <span className="flex items-center gap-1.5">
                      {/* Only a blocked account has a reason to show, so only a
                          blocked account offers the button. The reason itself
                          stays out of the table: it is a sentence, and a
                          sentence in a cell makes every row taller. */}
                      {blocked && user.blockReason ? (
                        <MockButton onClick={() => setViewing(user)}>
                          {t('users.blockReasonAction')}
                        </MockButton>
                      ) : null}

                      {/* Blocking is destructive and lifting one is not, so they
                          do not look alike: red to take access away, amber to
                          give it back. */}
                      <MockButton
                        tone={blocked ? 'warning' : 'danger'}
                        onClick={() => {
                          setConfirming(user)
                          setReason('')
                          setReasonTouched(false)
                        }}
                      >
                        {t(blocked ? 'users.unblockUser' : 'users.blockConfirm')}
                      </MockButton>
                    </span>
                  </Cell>
                </Row>
              )
            })}
          </AdminTable>
        )}

        {/* Pinned to the foot of the card, below the rows — never floating in
            the middle of the content. */}
        {state === 'ready' && data.total > 0 ? (
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
            <p className="text-xs text-text-muted">
              {t('users.showing', { from, to, total: formatNumber(data.total) })}
            </p>
            <span className="flex items-center gap-1.5">
              <MockButton
                disabled={data.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                {t('action.previous')}
              </MockButton>
              <span className="px-1 text-xs tabular-nums text-text-secondary">
                {data.page} / {data.totalPages}
              </span>
              <MockButton
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((current) => Math.min(data.totalPages, current + 1))}
              >
                {t('action.next')}
              </MockButton>
            </span>
          </div>
        ) : null}
      </AdminCard>

      {confirming ? (
        <AdminConfirmDialog
          title={t(confirming.status === 'blocked' ? 'users.unblockTitle' : 'users.blockTitle')}
          description={t(
            confirming.status === 'blocked' ? 'users.unblockBody' : 'users.blockBody',
            { name: confirming.name },
          )}
          confirmLabel={t(
            confirming.status === 'blocked' ? 'users.unblockUser' : 'users.blockConfirm',
          )}
          tone={confirming.status === 'blocked' ? 'warning' : 'danger'}
          busy={busy}
          confirmDisabled={confirming.status !== 'blocked' && reason.trim().length < 3}
          onCancel={closeDialog}
          onConfirm={apply}
        >
          {confirming.status === 'blocked' ? null : (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-primary">
                {t('users.blockReason')} <span className="text-error">*</span>
              </span>
              {/* A textarea, not an input: a reason is a sentence, and a
                  single-line field would hide the end of it as it is typed. */}
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                onBlur={() => setReasonTouched(true)}
                rows={3}
                maxLength={500}
                autoFocus
                placeholder={t('users.blockReasonPlaceholder')}
                className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {reasonTouched && reason.trim().length < 3 ? (
                <span role="alert" className="text-xs text-error">
                  {t('users.blockReasonRequired')}
                </span>
              ) : null}
            </label>
          )}

          {actionError ? (
            <p role="alert" className="mt-3 rounded-md bg-error/10 px-3 py-2 text-xs text-error">
              {actionError}
            </p>
          ) : null}
        </AdminConfirmDialog>
      ) : null}

      {viewing ? (
        <BlockDetailsDialog user={viewing} onClose={() => setViewing(null)} />
      ) : null}
    </div>
  )
}

export default AdminUsersPage
