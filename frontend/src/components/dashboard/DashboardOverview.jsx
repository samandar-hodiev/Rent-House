import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Building2, MessageSquare } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useChat } from '../../context/ChatContext'
import { useListings } from '../../context/ListingsContext'
import { LISTING_STATUS } from '../../data/myListings'
import { getTotalViews, getViewsAnalytics } from '../../data/viewsAnalytics'
import { ROUTES } from '../../routes/paths'
import ViewsChart from './ViewsChart'

// Reading the colours from the stylesheet rather than hard-coding hexes is what
// makes the chart theme-aware: the tokens are redefined under `html.dark`, so
// switching themes repaints the lines with no JS involved.
const SERIES_TOKENS = {
  daily: 'var(--color-chart-daily)',
  weekly: 'var(--color-chart-weekly)',
  monthly: 'var(--color-chart-monthly)',
}

/**
 * One headline figure.
 *
 * Deliberately lighter than the chart card: two of these side by side are a
 * glance, the chart underneath is the thing you actually read. Same border and
 * surface as every other dashboard card, so the difference is size and content
 * rather than a second visual style.
 */
function StatCard({ icon, label, value, hint, to, hintClass = 'text-text-muted' }) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </span>
      <span className="mt-3 block text-4xl font-semibold leading-none tracking-tight text-text-primary">
        {value}
      </span>
      <span className={`mt-2 block text-sm ${hintClass}`}>{hint}</span>
    </>
  )

  const shared = 'rounded-xl border border-border bg-surface p-5 transition-colors'

  // Both figures have somewhere to go, so both cards are links. Hover is a
  // border shift rather than a lift — no shadow, nothing moves.
  return (
    <Link
      to={to}
      className={`${shared} block hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      {body}
    </Link>
  )
}

// A legend entry. It names a line and nothing else — these are not filters, so
// they are not buttons and carry no press affordance.
function LegendItem({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}

/**
 * The account landing page: what happened, at a glance.
 *
 * Listing count and unread messages come from live application state. Only the
 * views series is mocked, and it is isolated in `data/viewsAnalytics.js` — see
 * the note there about the endpoint that replaces it.
 */
function DashboardOverview() {
  const { t } = useLocale()
  const { listings } = useListings()
  const { unreadTotal } = useChat()

  // Real: the same array "Mening e'lonlarim" renders, so publishing or closing
  // a listing moves this number with it.
  const activeListings = useMemo(
    () => listings.filter((listing) => listing.status === LISTING_STATUS.approved).length,
    [listings],
  )

  const analytics = useMemo(() => getViewsAnalytics(), [])
  const totalViews = useMemo(() => getTotalViews(analytics), [analytics])

  const series = useMemo(
    () => [
      { id: 'daily', label: t('dashboard.viewsDaily'), color: SERIES_TOKENS.daily, points: analytics.dailyViews },
      { id: 'weekly', label: t('dashboard.viewsWeekly'), color: SERIES_TOKENS.weekly, points: analytics.weeklyViews },
      { id: 'monthly', label: t('dashboard.viewsMonthly'), color: SERIES_TOKENS.monthly, points: analytics.monthlyViews },
    ],
    [analytics, t],
  )

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <h1 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
        {t('dashboard.overviewTitle')}
      </h1>

      {/* Two equal figures. They stack below `sm:` so nothing is squeezed on a
          narrow screen. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          icon={<Building2 aria-hidden="true" size={18} />}
          label={t('dashboard.statActiveListings')}
          value={activeListings}
          hint={t('dashboard.statListingsHint').replace('{count}', listings.length)}
          to={ROUTES.dashboardListings}
        />
        <StatCard
          icon={<MessageSquare aria-hidden="true" size={18} />}
          label={t('dashboard.statUnreadMessages')}
          value={unreadTotal}
          // Unread mail is not a problem to solve, so an empty inbox is stated
          // plainly in the muted colour rather than flagged.
          hint={
            unreadTotal > 0
              ? t('dashboard.unreadCount').replace('{count}', unreadTotal)
              : t('dashboard.noUnread')
          }
          hintClass={unreadTotal > 0 ? 'text-primary' : 'text-text-muted'}
          to={ROUTES.dashboardChats}
        />
      </section>

      {/* The dominant card: it holds the most information, so it gets the width
          and the height, and the two figures above stay small. */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary">
              {t('dashboard.viewsTitle')}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {t('dashboard.viewsSubtitle').replace('{count}', totalViews.toLocaleString('ru-RU'))}
            </p>
          </div>

          {/* Top-right on a wide card; wraps under the title on a narrow one so
              it can never push the header into an overflow. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:shrink-0 sm:justify-end">
            {series.map((line) => (
              <LegendItem key={line.id} color={line.color} label={line.label} />
            ))}
          </div>
        </div>

        <div className="mt-4">
          <ViewsChart series={series} ariaLabel={t('dashboard.viewsChartLabel')} />
        </div>
      </section>
    </div>
  )
}

export default DashboardOverview
