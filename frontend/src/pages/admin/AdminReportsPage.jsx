import { useCallback, useEffect, useRef, useState } from 'react'
import { Flag, Loader2, Search } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog'
import {
  ADMIN_SELECT, ADMIN_SELECT_STYLE, AdminCard, AdminTable, Cell, MockButton, PageHeading,
  Row, StatusBadge, useAdminFormat,
} from '../../components/admin/adminUi'
import Pagination from '../../components/Pagination'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { useToast } from '../../context/ToastContext'
import { fetchReports, setReportStatus } from '../../services/adminApi'
import { adminListingPath } from '../../routes/adminPaths'
import { Link } from 'react-router-dom'

const PER_PAGE = 10

// Long enough that typing a name is one request rather than eight, short enough
// that the list still feels like it is following along.
const SEARCH_DEBOUNCE = 300

const STATUSES = ['open', 'reviewing', 'resolved', 'dismissed']

/**
 * What a reviewer can do with a complaint from here.
 *
 * Deliberately short: taking it up, closing it as acted on, or closing it as
 * groundless. What happens to the listing itself is decided on the listing's
 * own page, where the listing can actually be read.
 */
const ACTIONS = {
  open: ['reviewing', 'resolved', 'dismissed'],
  reviewing: ['resolved', 'dismissed'],
  resolved: ['open'],
  dismissed: ['open'],
}

const TONE = { resolved: 'primary', dismissed: 'neutral', reviewing: 'warning', open: 'neutral' }

/**
 * Complaints about listings.
 *
 * This page used to be an honest empty state: nothing could be reported, so
 * nothing was recorded. Now a visitor can report a listing from its page, and
 * this is where those reports are read and answered.
 */
function AdminReportsPage() {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const { showToast } = useToast()
  const { formatDateTime } = useAdminFormat()

  const [status, setStatus] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const [data, setData] = useState({ reports: [], counts: {}, total: 0, limit: PER_PAGE })
  const [state, setState] = useState('loading')
  const [deciding, setDeciding] = useState(null)
  const [resolution, setResolution] = useState('')
  const [busy, setBusy] = useState(false)

  // The search follows the typing rather than each keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE)
    return () => clearTimeout(timer)
  }, [searchInput])

  const load = useCallback(
    async (signal) => {
      setState('loading')
      try {
        setData(await fetchReports({ status, search, page, limit: PER_PAGE, token, signal }))
        setState('ready')
      } catch (error) {
        if (error?.name === 'AbortError') return
        setState(error?.status === 403 ? 'forbidden' : 'error')
      }
    },
    [status, search, page, token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const decide = async () => {
    if (!deciding) return
    setBusy(true)
    try {
      await setReportStatus(deciding.report.id, {
        status: deciding.next,
        resolution,
        token,
      })
      showToast(t(`reports.decided.${deciding.next}`))
      setDeciding(null)
      setResolution('')
      await load()
    } catch (error) {
      showToast(error?.message || t('reports.decideFailed'))
    } finally {
      setBusy(false)
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / (data.limit || PER_PAGE)))

  if (state === 'forbidden') {
    return (
      <div className="flex flex-col gap-5">
        <PageHeading title={t('page.reports.title')} description={t('page.reports.description')} />
        <EmptyState title={t('page.reports.title')} description={t('admins.ownerOnly')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t('page.reports.title')}
        description={t('page.reports.description')}
      />

      {/* The tally above the table: how many are waiting, and how many have
          been dealt with. Counted by the server over everything, not over the
          page on screen. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => {
              setStatus(status === entry ? '' : entry)
              setPage(1)
            }}
            aria-pressed={status === entry}
            className={`rounded-xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              status === entry
                ? 'border-primary bg-primary-light/40'
                : 'border-border bg-surface hover:bg-surface-secondary'
            }`}
          >
            <span className="block text-xs text-text-muted">{t(`reportStatus.${entry}`)}</span>
            <span className="mt-1 block text-xl font-semibold text-text-primary">
              {data.counts[entry] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <AdminCard
        action={
          <label className="relative flex items-center">
            <Search
              aria-hidden="true"
              size={14}
              className="pointer-events-none absolute left-2.5 text-text-muted"
            />
            <span className="sr-only">{t('reports.searchLabel')}</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('reports.searchPlaceholder')}
              className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-64"
            />
          </label>
        }
      >
        {state === 'loading' ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 aria-hidden="true" size={20} className="animate-spin text-text-muted" />
          </div>
        ) : state === 'error' ? (
          <div className="p-4">
            <EmptyState
              icon={<Flag aria-hidden="true" size={28} />}
              title={t('reports.loadFailed')}
              description={t('login.errorNetwork')}
              actionLabel={t('analytics.retry')}
              onAction={() => load()}
            />
          </div>
        ) : data.reports.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Flag aria-hidden="true" size={28} />}
              title={t('empty.reports')}
              description={status || search ? t('reports.emptyFiltered') : t('reports.emptyAll')}
            />
          </div>
        ) : (
          <>
            <AdminTable
              headers={[
                t('table.listing'), t('table.reason'), t('table.reporter'),
                t('table.status'), t('table.date'), t('table.actions'),
              ]}
            >
              {data.reports.map((report) => (
                <Row key={report.id}>
                  <Cell>
                    <span className="flex min-w-0 flex-col">
                      <Link
                        to={adminListingPath(report.apartmentId)}
                        className="truncate font-medium text-text-primary hover:text-primary"
                      >
                        {report.apartmentTitle}
                      </Link>
                      {report.openCount > 1 ? (
                        <span className="text-[11px] text-warning">
                          {t('reports.openCount', { count: report.openCount })}
                        </span>
                      ) : null}
                    </span>
                  </Cell>
                  <Cell>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-text-primary">{t(`reportReason.${report.reason}`)}</span>
                      {report.comment ? (
                        <span className="mt-0.5 line-clamp-2 max-w-xs text-xs text-text-muted">
                          {report.comment}
                        </span>
                      ) : null}
                    </span>
                  </Cell>
                  <Cell className="whitespace-nowrap text-text-secondary">
                    {report.reporterName || t('reports.deletedReporter')}
                  </Cell>
                  <Cell>
                    <span className="flex min-w-0 flex-col gap-1">
                      <StatusBadge status={report.status} />
                      {report.resolvedByName ? (
                        <span className="text-[11px] text-text-muted">
                          {report.resolvedByName}
                        </span>
                      ) : null}
                    </span>
                  </Cell>
                  <Cell className="whitespace-nowrap text-text-secondary">
                    {formatDateTime(report.createdAt)}
                  </Cell>
                  <Cell>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {(ACTIONS[report.status] ?? []).map((next) => (
                        <MockButton
                          key={next}
                          tone={TONE[next]}
                          onClick={() => {
                            setDeciding({ report, next })
                            setResolution(report.resolution ?? '')
                          }}
                        >
                          {t(`reportAction.${next}`)}
                        </MockButton>
                      ))}
                    </span>
                  </Cell>
                </Row>
              ))}
            </AdminTable>

            <div className="border-t border-border p-3">
              <Pagination page={page} pages={pages} onChange={setPage} />
            </div>
          </>
        )}
      </AdminCard>

      {deciding ? (
        <AdminConfirmDialog
          title={t(`reportAction.${deciding.next}`)}
          description={t('reports.decideBody', {
            listing: deciding.report.apartmentTitle,
          })}
          confirmLabel={t(`reportAction.${deciding.next}`)}
          tone={deciding.next === 'dismissed' ? 'neutral' : 'primary'}
          busy={busy}
          onCancel={() => {
            setDeciding(null)
            setResolution('')
          }}
          onConfirm={decide}
        >
          {/* What was decided, in the reviewer's own words. Optional: not every
              decision needs explaining, and forcing a sentence produces "ok". */}
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              {t('reports.resolutionLabel')}
            </span>
            <textarea
              rows={3}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              maxLength={1000}
              placeholder={t('reports.resolutionPlaceholder')}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </label>
        </AdminConfirmDialog>
      ) : null}
    </div>
  )
}

export default AdminReportsPage
