import {
  AdminCard, AdminTable, Cell, PageHeading, Row, StatusBadge, formatDateTime,
} from '../../components/admin/adminUi'
import { AUDIT_LOGS } from '../../mock/admin'

function AdminAuditLogsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeading title="Audit Logs" description="What administrators have done." />

      <AdminCard>
        <AdminTable headers={['Admin', 'Action', 'Target', 'Date', 'IP', 'Status']}>
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
