import { NavLink } from 'react-router-dom'

const BASE_CLASS =
  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

// One sidebar/drawer entry. `variant="primary"` marks the emphasised action
// (posting a listing); `badge` renders the unread counter next to Chats.
function DashboardNavItem({ to, icon, label, badge, variant = 'default', onNavigate }) {
  if (variant === 'primary') {
    return (
      <NavLink
        to={to}
        onClick={onNavigate}
        className={`${BASE_CLASS} justify-center bg-primary text-white hover:bg-primary-hover`}
      >
        {icon}
        {label}
      </NavLink>
    )
  }

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `${BASE_CLASS} ${
          isActive
            ? 'bg-primary-light text-primary-hover'
            : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
        }`
      }
    >
      {icon}
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
