import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Minus, Shield } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { AdminCard, AdminTable, Cell, PageHeading, Row } from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { fetchPermissions } from '../../services/adminApi'

/**
 * What each role is allowed to reach.
 *
 * Not a table somebody wrote down: the server derives it from the rules the
 * middleware actually enforces and from the sidebar configuration the owner
 * set, so a row here cannot promise access the server would refuse. Switching a
 * section off on the Sidebar control page changes this page too.
 */
function AdminRolesPage() {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const [rows, setRows] = useState([])
  const [state, setState] = useState('loading')

  const load = useCallback(
    async (signal) => {
      setState('loading')
      try {
        setRows(await fetchPermissions({ token, signal }))
        setState('ready')
      } catch (error) {
        if (error?.name === 'AbortError') return
        setState('error')
      }
    },
    [token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const mark = (granted) =>
    granted ? (
      <span className="flex items-center gap-1.5 text-primary">
        <Check aria-hidden="true" size={15} />
        <span className="sr-only">{t('action.granted')}</span>
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-text-muted">
        <Minus aria-hidden="true" size={15} />
        <span className="sr-only">{t('action.notGranted')}</span>
      </span>
    )

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={t('page.roles.title')} description={t('page.roles.description')} />

      <AdminCard>
        {state === 'loading' ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 aria-hidden="true" size={20} className="animate-spin text-text-muted" />
          </div>
        ) : state === 'error' ? (
          <div className="p-4">
            <EmptyState
              icon={<Shield aria-hidden="true" size={28} />}
              title={t('roles.loadFailed')}
              description={t('login.errorNetwork')}
              actionLabel={t('analytics.retry')}
              onAction={() => load()}
            />
          </div>
        ) : (
          <AdminTable
            headers={[t('table.permission'), t('role.owner'), t('role.super_admin')]}
          >
            {rows.map((row) => (
              <Row key={row.section}>
                <Cell className="whitespace-nowrap font-medium text-text-primary">
                  {t(`nav.${row.section}`)}
                </Cell>
                <Cell>{mark(row.owner)}</Cell>
                <Cell>{mark(row.superAdmin)}</Cell>
              </Row>
            ))}
          </AdminTable>
        )}
      </AdminCard>

      <p className="text-xs text-text-muted">{t('roles.note')}</p>
    </div>
  )
}

export default AdminRolesPage
