import { Check, Minus } from 'lucide-react'
import { AdminCard, AdminTable, Cell, PageHeading, Row } from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { ADMIN_ROLES, PERMISSIONS } from '../../mock/admin'

function AdminRolesPage() {
  const { t } = useAdmin()
  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t('page.roles.title')}
        description={t('page.roles.description')}
      />

      <AdminCard>
        {/* The role names are data, not interface: they read the same in every
            language, so only the first column's heading is translated. */}
        <AdminTable headers={[t('table.permission'), ...ADMIN_ROLES]}>
          {PERMISSIONS.map((permission) => (
            <Row key={permission.name}>
              <Cell className="whitespace-nowrap font-medium text-text-primary">
                {permission.name}
              </Cell>
              {ADMIN_ROLES.map((role) => (
                <Cell key={role}>
                  {/* An icon and a label for screen readers: a tick and a dash
                      are indistinguishable to anyone not looking at them. */}
                  {permission[role] ? (
                    <span className="flex items-center gap-1.5 text-primary">
                      <Check aria-hidden="true" size={15} />
                      <span className="sr-only">{t('action.granted')}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-text-muted">
                      <Minus aria-hidden="true" size={15} />
                      <span className="sr-only">{t('action.notGranted')}</span>
                    </span>
                  )}
                </Cell>
              ))}
            </Row>
          ))}
        </AdminTable>
      </AdminCard>
    </div>
  )
}

export default AdminRolesPage
