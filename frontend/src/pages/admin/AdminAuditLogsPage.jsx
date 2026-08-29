import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Loader2 } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import {
  AdminCard, AdminTable, Cell, MockButton, PageHeading, Row, StatusBadge, useAdminFormat,
} from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { fetchAuditLogs } from '../../services/adminApi'

const PER_PAGE = 20

/**
 * What administrators have done.
 *
 * Recorded as the actions happen — signing in, creating or removing an
 * administrator, blocking an account, changing what the sidebar offers. It does
 * not record page views: burying the few entries that matter under thousands
 * that do not would make the log useless for the thing it exists for.
 */
function AdminAuditLogsPage() {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const { formatDateTime, formatNumber } = useAdminFormat()

  const [page, setPage] = useState(1)
  const [data, setData] = useState({ entries: [], total: 0, page: 1, totalPages: 1 })
  const [state, setState] = useState('loading')

  const load = useCallback(
    async (signal) => {
      setState('loading')
      try {
        setData(await fetchAuditLogs({ page, limit: PER_PAGE, token, signal }))
        setState('ready')
      } catch (error) {
        if (error?.name === 'AbortError') return
        setState('error')
      }
    },
    [page, token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={t('page.audit.title')} description={t('page.audit.description')} />

      <AdminCard>
        {state === 'loading' ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 aria-hidden="true" size={20} className="animate-spin text-text-muted" />
          </div>
        ) : state === 'error' ? (
          <div className="p-4">
            <EmptyState
              icon={<ClipboardList aria-hidden="true" size={28} />}
              title={t('audit.logLoadFailed')}
              description={t('login.errorNetwork')}
              actionLabel={t('analytics.retry')}
              onAction={() => load()}
            />
          </div>
        ) : (
          <AdminTable
            headers={[
              t('table.admin'), t('table.action'), t('table.target'), t('table.date'),
              t('table.ip'), t('table.status'),
            ]}
            empty={
              data.entries.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<ClipboardList aria-hidden="true" size={28} />}
                    title={t('audit.logEmpty')}
                    description={t('audit.logEmptyHint')}
                  />
                </div>
              ) : null
            }
          >
            {data.entries.map((entry) => (
              <Row key={entry.id}>
                <Cell className="whitespace-nowrap font-medium text-text-primary">
                  {entry.adminName}
                </Cell>
                <Cell className="whitespace-nowrap text-text-secondary">
                  {t(`auditAction.${entry.action}`)}
                </Cell>
                <Cell>
                  <span className="block max-w-[220px] truncate text-text-secondary">
                    {entry.target || '—'}
                  </span>
                </Cell>
                <Cell className="whitespace-nowrap text-text-secondary">
                  {formatDateTime(entry.createdAt)}
                </Cell>
                <Cell className="whitespace-nowrap tabular-nums text-text-secondary">
                  {entry.ip || '—'}
                </Cell>
                <Cell><StatusBadge status={entry.status} /></Cell>
              </Row>
            ))}
          </AdminTable>
        )}

        {state === 'ready' && data.total > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
            <p className="text-xs text-text-muted">
              {t('users.showing', {
                from: (data.page - 1) * PER_PAGE + 1,
                to: Math.min(data.page * PER_PAGE, data.total),
                total: formatNumber(data.total),
              })}
            </p>
            <span className="flex items-center gap-1.5">
              <MockButton disabled={data.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {t('action.previous')}
              </MockButton>
              <span className="px-1 text-xs tabular-nums text-text-secondary">
                {data.page} / {data.totalPages}
              </span>
              <MockButton
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              >
                {t('action.next')}
              </MockButton>
            </span>
          </div>
        ) : null}
      </AdminCard>
    </div>
  )
}

export default AdminAuditLogsPage
