import { Navigate } from 'react-router-dom'
import { AdminCard, PageHeading, Switch } from '../../components/admin/adminUi'
import { CONFIGURABLE_NAV } from '../../components/admin/AdminSidebar'
import { ADMIN_ROLE, useAdmin } from '../../context/AdminSettingsContext'
import { ADMIN_ROUTES } from '../../routes/adminPaths'

/**
 * Which sections the sidebar offers, as a row of switches.
 *
 * The owner's page. A super admin who types the address is sent back to the
 * dashboard rather than shown a board they cannot use — the sidebar does not
 * offer them the link either.
 *
 * The rows come from `CONFIGURABLE_NAV`, which is the navigation itself minus
 * the entries that have no switch, so this page cannot list a section the
 * sidebar does not have or miss one it does. Turning a section off hides it and
 * everything under it immediately; nothing here is saved to a server yet.
 */
function AdminSidebarControlPage() {
  const { t, role, sidebar, setSidebarItem } = useAdmin()

  if (role !== ADMIN_ROLE.owner) return <Navigate to={ADMIN_ROUTES.dashboard} replace />

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeading
        title={t('page.sidebarControl.title')}
        description={t('page.sidebarControl.description')}
      />

      <AdminCard>
        <ul className="flex flex-col">
          {CONFIGURABLE_NAV.map((item) => {
            const enabled = sidebar[item.id] !== false
            const labelId = `sidebar-control-${item.id}`
            return (
              <li
                key={item.id}
                className="flex items-start justify-between gap-4 border-b border-border p-4 last:border-0"
              >
                <span className="flex min-w-0 items-start gap-3">
                  <item.icon
                    aria-hidden="true"
                    size={16}
                    className="mt-0.5 shrink-0 text-text-muted"
                  />
                  <span className="min-w-0">
                    <span id={labelId} className="block text-sm font-medium text-text-primary">
                      {t(item.key)}
                    </span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {t(`sidebarControl.hint.${item.id}`)}
                    </span>
                  </span>
                </span>

                <Switch
                  checked={enabled}
                  labelledBy={labelId}
                  onChange={(next) => setSidebarItem(item.id, next)}
                />
              </li>
            )
          })}
        </ul>
      </AdminCard>

      <p className="text-xs text-text-muted">{t('sidebarControl.note')}</p>
    </div>
  )
}

export default AdminSidebarControlPage
