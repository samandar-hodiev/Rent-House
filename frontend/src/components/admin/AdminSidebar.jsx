import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Bell, BarChart3, ChevronDown, ChevronUp, ClipboardList, LayoutDashboard,
  MessageSquare, Settings, Shield, Building2, Flag, Users,
} from 'lucide-react'
import { ADMIN_ROUTES } from '../../routes/adminPaths'

const ICON = 16

// The navigation, exactly as the specification lists it. One declaration, read
// by both the desktop column and the mobile drawer, so the two can never offer
// different things.
export const ADMIN_NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: ADMIN_ROUTES.dashboard, end: true },
  {
    key: 'users', label: 'Users', icon: Users,
    children: [{ label: 'All Users', to: ADMIN_ROUTES.users }],
  },
  {
    key: 'listings', label: 'Listings', icon: Building2,
    children: [
      { label: 'All Listings', to: ADMIN_ROUTES.listings, end: true },
      { label: 'Pending', to: ADMIN_ROUTES.listingsPending },
      { label: 'Active', to: ADMIN_ROUTES.listingsActive },
      { label: 'Closed', to: ADMIN_ROUTES.listingsClosed },
      { label: 'Drafts', to: ADMIN_ROUTES.listingsDrafts },
      { label: 'Deleted', to: ADMIN_ROUTES.listingsDeleted },
    ],
  },
  { key: 'chats', label: 'Chats', icon: MessageSquare, to: ADMIN_ROUTES.chats },
  { key: 'reports', label: 'Reports', icon: Flag, to: ADMIN_ROUTES.reports },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, to: ADMIN_ROUTES.analytics },
  { key: 'notifications', label: 'Notifications', icon: Bell, to: ADMIN_ROUTES.notifications },
  {
    key: 'admin-management', label: 'Admin Management', icon: Shield,
    children: [
      { label: 'Admins', to: ADMIN_ROUTES.admins },
      { label: 'Roles & Permissions', to: ADMIN_ROUTES.roles },
    ],
  },
  { key: 'audit', label: 'Audit Logs', icon: ClipboardList, to: ADMIN_ROUTES.auditLogs },
  {
    key: 'settings', label: 'Settings', icon: Settings,
    children: [
      { label: 'General', to: ADMIN_ROUTES.settings, end: true },
      { label: 'Listings', to: ADMIN_ROUTES.settingsListings },
      { label: 'Chat', to: ADMIN_ROUTES.settingsChat },
      { label: 'Security', to: ADMIN_ROUTES.settingsSecurity },
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
        <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
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
                <span className="min-w-0 truncate">{child.label}</span>
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
  return (
    <nav aria-label="Admin navigation" className="flex flex-col gap-1 p-3">
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
            <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
          </NavLink>
        ),
      )}
    </nav>
  )
}

export default AdminNavList
