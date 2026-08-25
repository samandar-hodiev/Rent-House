import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { AdminCard, MockButton, PageHeading, Switch } from '../../components/admin/adminUi'
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
 * sidebar does not have or miss one it does. Turning a section off hides it —
 * and everything under it — from the super admin immediately. The owner's own
 * sidebar is never affected; nothing here is saved to a server yet.
 */
/**
 * Confirms putting the super admin's sidebar back to its defaults.
 *
 * Asked because the owner is undoing their own configuration in one step and
 * cannot get it back afterwards. Portalled into the admin root rather than the
 * document body, so it inherits the dashboard's own theme — a dialog on
 * `document.body` would sit outside `.rh-dark` and come out in the public
 * site's colours.
 */
function ResetDialog({ onCancel, onConfirm }) {
  const { t } = useAdmin()
  const dialogRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const host = document.getElementById('admin-root')
  if (!host) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sidebar-reset-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 focus:outline-none"
      >
        <h2 id="sidebar-reset-title" className="text-base font-semibold text-text-primary">
          {t('sidebarControl.resetTitle')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">{t('sidebarControl.resetBody')}</p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('action.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('sidebarControl.reset')}
          </button>
        </div>
      </div>
    </div>,
    host,
  )
}

function AdminSidebarControlPage() {
  const { t, role, sidebar, setSidebarItem, resetSidebar } = useAdmin()
  const [confirming, setConfirming] = useState(false)

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

        {/* Under the switches, inside the same card: it acts on all of them at
            once, so it belongs with them rather than off on its own. */}
        <div className="flex justify-end border-t border-border p-4">
          <MockButton onClick={() => setConfirming(true)}>
            <span className="flex items-center gap-1.5">
              <RotateCcw aria-hidden="true" size={13} className="shrink-0" />
              {t('sidebarControl.reset')}
            </span>
          </MockButton>
        </div>
      </AdminCard>

      <p className="text-xs text-text-muted">{t('sidebarControl.note')}</p>

      {confirming ? (
        <ResetDialog
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            resetSidebar()
            setConfirming(false)
          }}
        />
      ) : null}
    </div>
  )
}

export default AdminSidebarControlPage
