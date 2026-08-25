import UserAvatar from '../../components/dashboard/UserAvatar'
import {
  AdminCard, AdminTable, Cell, MockButton, PageHeading, Row, StatusBadge, useAdminFormat,
} from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { ADMINS } from '../../mock/admin'

function AdminAdminsPage() {
  const { t } = useAdmin()
  const { formatDateTime } = useAdminFormat()
  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t('page.admins.title')}
        description={t('page.admins.description', { count: ADMINS.length })}
      />

      <AdminCard>
        <AdminTable
          headers={[
            t('table.admin'), t('table.email'), t('table.role'), t('table.status'),
            t('table.lastActive'), t('table.actions'),
          ]}
        >
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
                  <MockButton>{t('action.edit')}</MockButton>
                  <MockButton tone="danger">{t('action.suspend')}</MockButton>
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
