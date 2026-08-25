import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { LogOut, Menu, Settings, ShieldCheck, SlidersHorizontal, User, X } from 'lucide-react'
import { useDismiss } from '../../hooks/useDismiss'
import { useRef } from 'react'
import UserAvatar from '../dashboard/UserAvatar'
import { AdminNavList, AdminSidebarFooter } from './AdminSidebar'
import { ADMIN_ROLE, AdminSettingsProvider, useAdmin } from '../../context/AdminSettingsContext'
import { ADMIN_ROUTES } from '../../routes/adminPaths'

// The signed-in administrator. Fake, like everything else in this module —
// there is no admin authentication yet, and inventing one was explicitly out
// of scope.
const CURRENT_ADMIN = { name: 'Samandar Hodiev' }

function AdminProfileMenu() {
  const { t, role, setRole } = useAdmin()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useDismiss(ref, open, () => setOpen(false))

  const item =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <UserAvatar name={CURRENT_ADMIN.name} />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-sm font-medium text-text-primary">
            {CURRENT_ADMIN.name}
          </span>
          <span className="block truncate text-[11px] text-text-muted">{t(`role.${role}`)}</span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-[0_4px_16px_rgba(15,23,42,0.16)]"
        >
          <button type="button" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <User aria-hidden="true" size={15} className="shrink-0" />
            {t('header.profile')}
          </button>
          <Link
            to={ADMIN_ROUTES.settings}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={item}
          >
            <Settings aria-hidden="true" size={15} className="shrink-0" />
            {t('header.settings')}
          </Link>
          {/* Until admin sign-in exists there is nobody to be, so the two
              roles are offered as a preview. It is the only way to see what a
              super admin's sidebar looks like after the owner has configured
              it, and it goes when the session provides the role instead. */}
          <p className="mt-1 border-t border-border px-3 pb-1 pt-2 text-[11px] font-medium text-text-muted">
            {t('role.preview')}
          </p>
          {Object.values(ADMIN_ROLE).map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={role === option}
              onClick={() => {
                setRole(option)
                setOpen(false)
              }}
              className={`${item} ${role === option ? 'font-medium text-primary-hover dark:text-primary' : ''}`}
            >
              <ShieldCheck aria-hidden="true" size={15} className="shrink-0" />
              {t(`role.${option}`)}
            </button>
          ))}

          <button
            type="button"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={`${item} mt-1 border-t border-border pt-2 text-error hover:bg-error/10`}
          >
            <LogOut aria-hidden="true" size={15} className="shrink-0" />
            {t('header.logout')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The admin shell: a fixed navigation column and everything else.
 *
 * Deliberately its own layout rather than the dashboard's. The two answer to
 * different people — one manages a person's own listings, the other manages
 * everybody's — and sharing a shell would mean every change to one had to be
 * checked against the other.
 *
 * It reuses the tokens, the avatar and the theme toggle, so it looks like the
 * same product without being the same screen.
 */
function AdminShell() {
  const { t, theme } = useAdmin()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  // A navigation closes the drawer; leaving it open over the page it just
  // opened is the classic mobile-menu bug.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  return (
    // The theme is a class on this element rather than on <html>, so the admin
    // area can be dark while the public site is light. See `.rh-dark` and
    // `.rh-light` in index.css.
    <div
      id="admin-root"
      className={`flex min-h-screen bg-background ${theme === 'dark' ? 'rh-dark' : 'rh-light'}`}
    >
      {/* Desktop column. Fixed width, its own scroll, so a long navigation
          never pushes the page. */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block 2xl:w-64">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <span className="text-sm font-semibold text-text-primary">RentHouse</span>
            <span className="rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-hover dark:text-primary">
              {t('brand.admin')}
            </span>
          </div>
          <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
            <AdminNavList />
          </div>
          {/* Below the navigation and pinned there, so the two are visibly
              different kinds of thing: one moves you around the dashboard, the
              other configures it or leaves it. */}
          <AdminSidebarFooter />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t('nav.open')}
            className="flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
          >
            <Menu aria-hidden="true" size={18} />
          </button>

          <Link to={ADMIN_ROUTES.dashboard} className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-text-primary">RentHouse</span>
            <span className="hidden rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-hover dark:text-primary sm:inline lg:hidden">
              {t('brand.admin')}
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <AdminProfileMenu />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer. The same navigation, not a second copy of it. */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <div
            onClick={(event) => event.stopPropagation()}
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="text-sm font-semibold text-text-primary">RentHouse Admin</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t('nav.close')}
                className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
              <AdminNavList onNavigate={() => setDrawerOpen(false)} />
            </div>
            <AdminSidebarFooter onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The provider sits outside the shell so everything inside — including the
 * shell's own chrome — reads the same theme and language.
 */
function AdminLayout() {
  return (
    <AdminSettingsProvider>
      <AdminShell />
    </AdminSettingsProvider>
  )
}

export default AdminLayout
