import {
  AdminCard, AdminTable, Cell, PageHeading, Row, StatusBadge, useAdminFormat,
} from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { AUDIT_LOGS } from '../../mock/admin'

function AdminAuditLogsPage() {
  const { t } = useAdmin()
  const { formatDateTime } = useAdminFormat()
  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={t('page.audit.title')} description={t('page.audit.description')} />

      <AdminCard>
        <AdminTable
          headers={[
            t('table.admin'), t('table.action'), t('table.target'), t('table.date'),
            t('table.ip'), t('table.status'),
          ]}
        >
          {AUDIT_LOGS.map((log) => (
            <Row key={log.id}>
              <Cell className="whitespace-nowrap font-medium text-text-primary">
                {log.admin.name}
              </Cell>
              <Cell className="whitespace-nowrap text-text-secondary">{log.action}</Cell>
              <Cell className="whitespace-nowrap text-text-secondary">{log.target}</Cell>
              <Cell className="whitespace-nowrap text-text-secondary">
                {formatDateTime(log.at)}
              </Cell>
              <Cell className="whitespace-nowrap tabular-nums text-text-secondary">{log.ip}</Cell>
              <Cell><StatusBadge status={log.status} /></Cell>
            </Row>
          ))}
        </AdminTable>
      </AdminCard>
    </div>
  )
}

export default AdminAuditLogsPage
