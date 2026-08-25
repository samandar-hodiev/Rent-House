import { Flag } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import {
  AdminCard, AdminTable, Cell, MockButton, PageHeading, Row, StatusBadge, useAdminFormat,
} from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { REPORTS } from '../../mock/admin'

function AdminReportsPage() {
  const { t } = useAdmin()
  const { formatDate } = useAdminFormat()
  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t('page.reports.title')}
        description={t('page.reports.description', { count: REPORTS.length })}
      />

      <AdminCard>
        <AdminTable
          headers={[
            t('table.reportId'), t('table.reporter'), t('table.reportedUser'), t('table.listing'),
            t('table.reason'), t('table.status'), t('table.created'), t('table.actions'),
          ]}
          empty={
            REPORTS.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Flag aria-hidden="true" size={28} />}
                  title={t('empty.reports')}
                  description={t('empty.reportsHint')}
                />
              </div>
            ) : null
          }
        >
          {REPORTS.map((report) => (
            <Row key={report.id}>
              <Cell className="whitespace-nowrap font-medium text-text-primary">{report.id}</Cell>
              <Cell className="whitespace-nowrap text-text-secondary">{report.reporter.name}</Cell>
              <Cell className="whitespace-nowrap text-text-secondary">{report.reported.name}</Cell>
              <Cell>
                <span className="block max-w-[180px] truncate text-text-secondary">
                  {report.listing.title}
                </span>
              </Cell>
              <Cell className="whitespace-nowrap text-text-secondary">{report.reason}</Cell>
              <Cell><StatusBadge status={report.status} /></Cell>
              <Cell className="whitespace-nowrap text-text-secondary">
                {formatDate(report.createdAt)}
              </Cell>
              <Cell>
                <span className="flex items-center gap-1.5">
                  <MockButton>{t('action.view')}</MockButton>
                  <MockButton tone="primary">{t('action.resolve')}</MockButton>
                  <MockButton tone="danger">{t('action.reject')}</MockButton>
                </span>
              </Cell>
            </Row>
          ))}
        </AdminTable>
      </AdminCard>
    </div>
  )
}

export default AdminReportsPage
