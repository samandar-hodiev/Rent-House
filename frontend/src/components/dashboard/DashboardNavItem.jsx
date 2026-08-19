import { NavLink } from 'react-router-dom'

// One sidebar/drawer entry. Every item shares the same size, padding and
// structure; `accent` only tints the icon so an important action can stand out
// without becoming a differently-shaped CTA.
function DashboardNavItem({ to, icon, label, badge, accent = false, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          isActive
            ? 'bg-primary-light text-primary-hover dark:text-primary'
            : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={accent && !isActive ? 'text-primary' : undefined}>{icon}</span>
          <span className="flex-1 text-left">{label}</span>
          {badge ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

export default DashboardNavItem
