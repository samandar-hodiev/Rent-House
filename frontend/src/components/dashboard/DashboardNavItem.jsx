import { NavLink } from 'react-router-dom'

// Shared so non-link entries (the Settings popover trigger) match exactly.
export const NAV_ITEM_BASE =
  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
export const NAV_ITEM_ACTIVE = 'bg-primary-light text-primary-hover dark:text-primary'
export const NAV_ITEM_IDLE =
  'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'

// One sidebar/drawer entry. Every item shares the same size, padding, icon
// treatment and structure — the icon simply inherits the row's text colour, so
// green means "you are here" and nothing else. Tinting one idle icon to mark it
// as important made the sidebar look like it had two kinds of entry.
function DashboardNavItem({ to, icon, label, badge, end = false, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `${NAV_ITEM_BASE} ${isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE}`
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {badge ? (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </NavLink>
  )
}

export default DashboardNavItem
