import { Flag } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import {
  AdminCard, AdminTable, Cell, MockButton, PageHeading, Row, StatusBadge, formatDate,
} from '../../components/admin/adminUi'
import { REPORTS } from '../../mock/admin'

function AdminReportsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeading title="Reports" description={`${REPORTS.length} reports filed.`} />

      <AdminCard>
        <AdminTable
          headers={[
            'Report ID', 'Reporter', 'Reported User', 'Listing', 'Reason', 'Status', 'Created',
            'Actions',
          ]}
          empty={
            REPORTS.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Flag aria-hidden="true" size={28} />}
                  title="No reports"
                  description="Nothing has been reported."
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
                  <MockButton>View</MockButton>
                  <MockButton tone="primary">Resolve</MockButton>
                  <MockButton tone="danger">Reject</MockButton>
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
