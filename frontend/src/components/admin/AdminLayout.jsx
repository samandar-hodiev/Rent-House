import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { LogOut, Menu, Settings, User, X } from 'lucide-react'
import { useDismiss } from '../../hooks/useDismiss'
import { useRef } from 'react'
import ThemeToggle from '../ThemeToggle'
import UserAvatar from '../dashboard/UserAvatar'
import { AdminNavList } from './AdminSidebar'
import { ADMIN_ROUTES } from '../../routes/adminPaths'

// The signed-in administrator. Fake, like everything else in this module —
// there is no admin authentication yet, and inventing one was explicitly out
// of scope.
const CURRENT_ADMIN = { name: 'Samandar Hodiev', role: 'Super Admin' }

function AdminProfileMenu() {
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
          <span className="block truncate text-[11px] text-text-muted">{CURRENT_ADMIN.role}</span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-[0_4px_16px_rgba(15,23,42,0.16)]"
        >
          <button type="button" role="menuitem" className={item} onClick={() => setOpen(false)}>
            <User aria-hidden="true" size={15} className="shrink-0" />
            Profile
          </button>
          <Link
            to={ADMIN_ROUTES.settings}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={item}
          >
            <Settings aria-hidden="true" size={15} className="shrink-0" />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={`${item} mt-1 border-t border-border pt-2 text-error hover:bg-error/10`}
          >
            <LogOut aria-hidden="true" size={15} className="shrink-0" />
            Logout
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
function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  // A navigation closes the drawer; leaving it open over the page it just
  // opened is the classic mobile-menu bug.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop column. Fixed width, its own scroll, so a long navigation
          never pushes the page. */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface lg:block 2xl:w-64">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <span className="text-sm font-semibold text-text-primary">RentHouse</span>
            <span className="rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-hover dark:text-primary">
              Admin
            </span>
          </div>
          <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
            <AdminNavList />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
          >
            <Menu aria-hidden="true" size={18} />
          </button>

          <Link to={ADMIN_ROUTES.dashboard} className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-text-primary">RentHouse</span>
            <span className="hidden rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-hover dark:text-primary sm:inline lg:hidden">
              Admin
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
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
                aria-label="Close navigation"
                className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <div className="chat-scroll min-h-0 flex-1 overflow-y-auto">
              <AdminNavList onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default AdminLayout
