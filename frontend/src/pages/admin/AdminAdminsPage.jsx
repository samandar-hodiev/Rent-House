import UserAvatar from '../../components/dashboard/UserAvatar'
import {
  AdminCard, AdminTable, Cell, MockButton, PageHeading, Row, StatusBadge, formatDateTime,
} from '../../components/admin/adminUi'
import { ADMINS } from '../../mock/admin'

function AdminAdminsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeading title="Admins" description={`${ADMINS.length} administrator accounts.`} />

      <AdminCard>
        <AdminTable headers={['Admin', 'Email', 'Role', 'Status', 'Last Active', 'Actions']}>
          {ADMINS.map((admin) => (
            <Row key={admin.id}>
              <Cell>
                <span className="flex min-w-0 items-center gap-2.5">
                  <UserAvatar name={admin.name} />
                  <span className="min-w-0 truncate font-medium text-text-primary">
                    {admin.name}
                  </span>
                </span>
              </Cell>
              <Cell className="text-text-secondary">{admin.email}</Cell>
              <Cell className="whitespace-nowrap text-text-secondary">{admin.role}</Cell>
              <Cell><StatusBadge status={admin.status} /></Cell>
              <Cell className="whitespace-nowrap text-text-secondary">
                {formatDateTime(admin.lastActiveAt)}
              </Cell>
              <Cell>
                <span className="flex items-center gap-1.5">
                  <MockButton>Edit</MockButton>
                  <MockButton tone="danger">Suspend</MockButton>
                </span>
              </Cell>
            </Row>
          ))}
        </AdminTable>
      </AdminCard>
    </div>
  )
}

export default AdminAdminsPage
