import { Check, Minus } from 'lucide-react'
import { AdminCard, AdminTable, Cell, PageHeading, Row } from '../../components/admin/adminUi'
import { ADMIN_ROLES, PERMISSIONS } from '../../mock/admin'

function AdminRolesPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title="Roles & Permissions"
        description="What each role is allowed to reach."
      />

      <AdminCard>
        <AdminTable headers={['Permission', ...ADMIN_ROLES]}>
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
                      <span className="sr-only">Granted</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-text-muted">
                      <Minus aria-hidden="true" size={15} />
                      <span className="sr-only">Not granted</span>
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
