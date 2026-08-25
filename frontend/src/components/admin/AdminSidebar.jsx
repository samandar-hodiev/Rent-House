import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Bell, BarChart3, ChevronDown, ChevronUp, ClipboardList, LayoutDashboard, LogOut,
  MessageSquare, Settings, Shield, SlidersHorizontal, Building2, Flag, Users,
} from 'lucide-react'
import { ADMIN_ROUTES } from '../../routes/adminPaths'
import { useAdmin } from '../../context/AdminSettingsContext'

const ICON = 16

// The navigation, exactly as the specification lists it. One declaration, read
// by both the desktop column and the mobile drawer, so the two can never offer
// different things.
export const ADMIN_NAV = [
  { key: 'nav.dashboard', icon: LayoutDashboard, to: ADMIN_ROUTES.dashboard, end: true },
  {
    key: 'nav.users', icon: Users,
    children: [{ key: 'nav.allUsers', to: ADMIN_ROUTES.users }],
  },
  {
    key: 'nav.listings', icon: Building2,
    children: [
      { key: 'nav.allListings', to: ADMIN_ROUTES.listings, end: true },
      { key: 'nav.pending', to: ADMIN_ROUTES.listingsPending },
      { key: 'nav.active', to: ADMIN_ROUTES.listingsActive },
      { key: 'nav.closed', to: ADMIN_ROUTES.listingsClosed },
      { key: 'nav.drafts', to: ADMIN_ROUTES.listingsDrafts },
      { key: 'nav.deleted', to: ADMIN_ROUTES.listingsDeleted },
    ],
  },
  { key: 'nav.chats', icon: MessageSquare, to: ADMIN_ROUTES.chats },
  { key: 'nav.reports', icon: Flag, to: ADMIN_ROUTES.reports },
  { key: 'nav.analytics', icon: BarChart3, to: ADMIN_ROUTES.analytics },
  { key: 'nav.notifications', icon: Bell, to: ADMIN_ROUTES.notifications },
  {
    key: 'nav.adminManagement', icon: Shield,
    children: [
      { key: 'nav.admins', to: ADMIN_ROUTES.admins },
      { key: 'nav.roles', to: ADMIN_ROUTES.roles },
    ],
  },
  { key: 'nav.auditLogs', icon: ClipboardList, to: ADMIN_ROUTES.auditLogs },
  {
    key: 'nav.settings', icon: Settings,
    children: [
      { key: 'nav.general', to: ADMIN_ROUTES.settings, end: true },
      { key: 'nav.listings', to: ADMIN_ROUTES.settingsListings },
      { key: 'nav.chat', to: ADMIN_ROUTES.settingsChat },
      { key: 'nav.security', to: ADMIN_ROUTES.settingsSecurity },
    ],
  },
]

const BASE =
  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const ACTIVE = 'bg-primary-light text-primary-hover dark:text-primary'
const IDLE = 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'

const CHILD_BASE =
  'flex w-full items-center rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

function NavGroup({ item, onNavigate }) {
  const { t } = useAdmin()
  const location = useLocation()
  const Icon = item.icon
  // Open when the reader is already inside it, so arriving by URL does not
  // leave the section that contains them collapsed.
  const holdsCurrent = item.children.some((child) =>
    child.end ? location.pathname === child.to : location.pathname.startsWith(child.to),
  )
  const [expanded, setExpanded] = useState(holdsCurrent)

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        // A group is not a destination, so it never takes the "you are here"
        // colour — one of its children does.
        className={`${BASE} ${IDLE}`}
      >
        <Icon aria-hidden="true" size={ICON} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{t(item.key)}</span>
        {expanded ? (
          <ChevronUp aria-hidden="true" size={14} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronDown aria-hidden="true" size={14} className="shrink-0 text-text-muted" />
        )}
      </button>

      {expanded ? (
        <ul className="ml-2 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
          {item.children.map((child) => (
            <li key={child.to}>
              <NavLink
                to={child.to}
                end={child.end}
                onClick={onNavigate}
                className={({ isActive }) => `${CHILD_BASE} ${isActive ? ACTIVE : IDLE}`}
              >
                <span className="min-w-0 truncate">{t(child.key)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** The admin navigation. Shared by the fixed column and the mobile drawer. */
export function AdminNavList({ onNavigate }) {
  const { t } = useAdmin()
  return (
    <nav aria-label={t('nav.label')} className="flex flex-col gap-1 p-3">
      {ADMIN_NAV.map((item) =>
        item.children ? (
          <NavGroup key={item.key} item={item} onNavigate={onNavigate} />
        ) : (
          <NavLink
            key={item.key}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) => `${BASE} ${isActive ? ACTIVE : IDLE}`}
          >
            <item.icon aria-hidden="true" size={ICON} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{t(item.key)}</span>
          </NavLink>
        ),
      )}
    </nav>
  )
}

/**
 * What sits under the navigation: configuring the dashboard, and leaving it.
 *
 * Separated by a rule because neither is a section of the dashboard — one
 * changes how it looks and reads, the other ends the session. Log out is last,
 * as it is everywhere else in the application.
 */
export function AdminSidebarFooter({ onNavigate }) {
  const { t } = useAdmin()

  return (
    <div className="shrink-0 border-t border-border p-3">
      <NavLink
        to={ADMIN_ROUTES.dashboardSettings}
        onClick={onNavigate}
        className={({ isActive }) => `${BASE} ${isActive ? ACTIVE : IDLE}`}
      >
        <SlidersHorizontal aria-hidden="true" size={ICON} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{t('nav.dashboardSettings')}</span>
      </NavLink>

      {/* No session to end yet — admin authentication is not part of this
          stage — so this is the control in its place, not a working sign-out
          pretending to be one. */}
      <button
        type="button"
        onClick={onNavigate}
        className={`${BASE} ${IDLE} hover:text-error`}
      >
        <LogOut aria-hidden="true" size={ICON} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{t('nav.logout')}</span>
      </button>
    </div>
  )
}

export default AdminNavList
