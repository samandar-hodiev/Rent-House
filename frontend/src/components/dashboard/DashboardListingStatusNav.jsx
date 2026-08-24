import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Building2, CheckCircle2, ChevronDown, ChevronUp, Clock, FileText, XCircle } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useListings } from '../../context/ListingsContext'
import { LISTING_FILTERS, filterFromSearch, getFilterCounts } from '../../data/listingStatus'
import { ROUTES } from '../../routes/paths'
import { NAV_ITEM_BASE, NAV_ITEM_ACTIVE, NAV_ITEM_IDLE } from './DashboardNavItem'

// The children's own base rather than the top-level row's with overrides on
// top. Two `px-` or two `gap-` utilities in one class list are resolved by
// their order in the stylesheet, not by the order they are written, so
// "override" is not something to rely on — and the tighter box is what lets
// "Barcha e'lonlar" fit the 224px sidebar without an ellipsis.
const CHILD_BASE =
  'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

const ICON_SIZE = 18
const CHILD_ICON_SIZE = 15

// One icon and one tint per state, so the colour carries the same meaning it
// does on a listing's own badge: live, waiting, finished, unpublished. Only the
// icon is tinted — tinting the label too would make an idle row look selected,
// which is what the sidebar reserves green for.
const STATUS_ICONS = {
  all: { Icon: Building2, tint: 'text-text-muted' },
  active: { Icon: CheckCircle2, tint: 'text-primary' },
  pending: { Icon: Clock, tint: 'text-warning' },
  closed: { Icon: XCircle, tint: 'text-error' },
  draft: { Icon: FileText, tint: 'text-text-muted' },
}

/**
 * "Listing status" and the states underneath it.
 *
 * Expands in place rather than into a popover: the children are navigation,
 * and navigation that disappears when the pointer leaves it is harder to use
 * than a list that simply stays open.
 *
 * The children are query strings on one route rather than five routes. The
 * page they lead to is the same page with one filter applied, so giving each a
 * path of its own would be five ways to render one screen — and the filter
 * belongs in the URL either way, so a filtered view can be reloaded or shared.
 */
function DashboardListingStatusNav({ onNavigate }) {
  const { t } = useLocale()
  const location = useLocation()
  // Already loaded for the dashboard, so the counts cost nothing extra and are
  // the same numbers the listings page shows.
  const { listings } = useListings()

  const onListings = location.pathname === ROUTES.dashboardListings
  const activeKey = onListings ? filterFromSearch(location.search).key : null

  // Open when the reader is already inside it, and openable anywhere else.
  const [expanded, setExpanded] = useState(onListings)

  const counts = getFilterCounts(listings)

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        // The group is not itself a destination, so it is never the green
        // "you are here" row — one of its children is.
        className={`${NAV_ITEM_BASE} ${NAV_ITEM_IDLE} w-full`}
      >
        <span className="shrink-0">
          <Building2 aria-hidden="true" size={ICON_SIZE} />
        </span>
        <span className="flex-1 text-left">{t('dashboard.listingStatus')}</span>
        {expanded ? (
          <ChevronUp aria-hidden="true" size={16} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronDown aria-hidden="true" size={16} className="shrink-0 text-text-muted" />
        )}
      </button>

      {expanded ? (
        // Indented under the parent, with a rule standing in for the tree line.
        <ul className="ml-2 flex flex-col gap-0.5 border-l border-border pl-2">
          {LISTING_FILTERS.map((filter) => {
            const { Icon, tint } = STATUS_ICONS[filter.key]
            const isActive = activeKey === filter.key
            const to = filter.status
              ? `${ROUTES.dashboardListings}?status=${filter.status}`
              : ROUTES.dashboardListings

            return (
              <li key={filter.key}>
                <Link
                  to={to}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  // Tighter than a top-level row: these are children, and
                  // matching the parent's height exactly would read as five
                  // more sections rather than one section's states.
                  className={`${CHILD_BASE} ${isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE}`}
                >
                  <span className={`shrink-0 ${isActive ? '' : tint}`}>
                    <Icon aria-hidden="true" size={CHILD_ICON_SIZE} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">
                    {t(`dashboard.listingFilter.${filter.key}`)}
                  </span>
                  {/* Zero is shown rather than hidden: "no closed listings" is
                      an answer, and a count that vanishes makes the column
                      jump as the numbers change. */}
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                      isActive ? 'bg-primary/15 text-primary' : 'bg-surface-secondary text-text-muted'
                    }`}
                  >
                    {counts[filter.key]}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export default DashboardListingStatusNav
