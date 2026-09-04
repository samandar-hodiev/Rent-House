import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Heart, Loader2, MessageSquare } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useChat } from '../../context/ChatContext'
import { useDashboardSummary } from '../../hooks/useDashboardSummary'
import { useViewsAnalytics } from '../../hooks/useViewsAnalytics'
import { formatCount } from '../../utils/formatPeriod'
import { ROUTES } from '../../routes/paths'
import DashboardNotifications from './DashboardNotifications'
import ViewsChart from './ViewsChart'

// Reading the colours from the stylesheet rather than hard-coding hexes is what
// makes the chart theme-aware: the tokens are redefined under `html.dark`, so
// switching themes repaints the lines with no JS involved. One definition per
// series feeds the line, the legend dot and the tooltip swatch alike, so those
// three can never disagree.
const SERIES = [
  { id: 'daily', labelKey: 'dashboard.viewsDaily', color: 'var(--color-chart-daily)' },
  { id: 'weekly', labelKey: 'dashboard.viewsWeekly', color: 'var(--color-chart-weekly)' },
  { id: 'monthly', labelKey: 'dashboard.viewsMonthly', color: 'var(--color-chart-monthly)' },
]

const FILTERS = [
  { id: 'all', labelKey: 'dashboard.viewsAll' },
  { id: 'daily', labelKey: 'dashboard.viewsDaily' },
  { id: 'weekly', labelKey: 'dashboard.viewsWeekly' },
  { id: 'monthly', labelKey: 'dashboard.viewsMonthly' },
]

/**
 * One headline figure.
 *
 * Deliberately lighter than the chart card: two of these side by side are a
 * glance, the chart underneath is the thing you read. Same border and surface
 * as every other dashboard card, so the difference is size and content rather
 * than a second visual style.
 */
function StatCard({ icon, label, value, hint, to, hintClass = 'text-text-muted' }) {
  return (
    <Link
      to={to}
      className="block rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </span>
      <span className="mt-3 block text-4xl font-semibold leading-none tracking-tight text-text-primary">
        {value}
      </span>
      <span className={`mt-2 block text-sm ${hintClass}`}>{hint}</span>
    </Link>
  )
}

// A legend entry. It names a line and nothing else — selecting a series is the
// filter's job, so these carry no press affordance.
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
 * Every figure on it is real: the listing count and unread messages come from
 * live application state, and the views series from recorded view events that
 * PostgreSQL aggregates into daily, weekly and monthly totals.
 */
function DashboardOverview() {
  const { t } = useLocale()
  // The chat context is the live one: a message arriving over the socket moves
  // this badge without waiting for the summary to be refetched.
  const { unreadTotal } = useChat()
  const [filter, setFilter] = useState('all')

  // Three counters and two short lists, in one request. Every figure is
  // counted by the database against the signed-in user — nothing here is
  // derived from whatever the client happens to be holding.
  const { summary, status: summaryStatus } = useDashboardSummary()
  const counts = summary?.counts

  // Real view events, aggregated by PostgreSQL. Refetched when the tab regains
  // focus, so opening a listing in another tab and coming back shows the view.
  const { points, status, totalViews, isEmpty } = useViewsAnalytics()

  // The filter picks which series are drawn; it never touches the data, so the
  // chart and the tooltip keep reading the same rows whatever is selected.
  const visibleSeries = useMemo(() => {
    const chosen = filter === 'all' ? SERIES : SERIES.filter((line) => line.id === filter)
    return chosen.map((line) => ({ ...line, label: t(line.labelKey) }))
  }, [filter, t])

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <h1 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
        {t('dashboard.overviewTitle')}
      </h1>

      {/* What happened to this account's listings while they were away. Above
          the figures because it is news, and the figures are a state. */}
      <DashboardNotifications />

      {/* Three equal figures: what you have published, what is waiting to be
          read, and what you saved. Two columns on a tablet and one on a phone,
          so none of them is squeezed. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<Building2 aria-hidden="true" size={18} />}
          label={t('dashboard.statActiveListings')}
          value={counts?.activeListings ?? 0}
          hint={t('dashboard.statListingsHint', { count: counts?.totalListings ?? 0 })}
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
              ? t('dashboard.newMessages', { count: unreadTotal })
              : t('dashboard.noUnread')
          }
          hintClass={unreadTotal > 0 ? 'text-primary' : 'text-text-muted'}
          to={ROUTES.dashboardChats}
        />
        <StatCard
          icon={<Heart aria-hidden="true" size={18} />}
          label={t('dashboard.statSaved')}
          value={counts?.savedApartments ?? 0}
          hint={t('dashboard.statSavedHint')}
          to={ROUTES.dashboardSaved}
        />
      </section>

      {summaryStatus === 'error' ? (
        <p role="alert" className="text-sm text-error">
          {t('dashboard.summaryFailed')}
        </p>
      ) : null}

      {/* The dominant card: it holds the most information, so it gets the width
          and the height, and the two figures above stay small. */}
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary">
              {t('dashboard.viewsTitle')}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {t('dashboard.viewsSubtitle', { count: formatCount(totalViews) })}
            </p>
          </div>

          {/* Legend follows the filter: with one series selected there is only
              one line to name. It wraps under the title on a narrow card rather
              than pushing the header into an overflow. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:shrink-0 sm:justify-end">
            {visibleSeries.map((line) => (
              <LegendItem key={line.id} color={line.color} label={line.label} />
            ))}
          </div>
        </div>

        {/* Radio semantics rather than plain buttons: these are four mutually
            exclusive states of one control, which also gives arrow-key movement
            between them for free.

            A 2×2 grid on a phone rather than a wrapping row — four labels of
            different lengths wrap 3-and-1 at 320px, which reads as a mistake.
            One row from `sm:` up, where they fit. */}
        <div
          role="radiogroup"
          aria-label={t('dashboard.viewsFilterLabel')}
          className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-secondary p-1 sm:grid-cols-4"
        >
          {FILTERS.map((option) => {
            const isActive = filter === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setFilter(option.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm ${
                  isActive
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t(option.labelKey)}
              </button>
            )
          })}
        </div>

        {/* The chart is drawn only when there is something to draw. A listing
            nobody has opened yet gets a sentence saying so, because a flat line
            at zero looks like a broken chart and an invented one would be a
            lie. */}
        <div className="mt-4">
          {status === 'loading' ? (
            <p className="flex h-[260px] items-center justify-center gap-2 text-sm text-text-muted">
              <Loader2 aria-hidden="true" size={16} className="animate-spin" />
              {t('dashboard.viewsLoading')}
            </p>
          ) : status === 'error' ? (
            <p
              role="alert"
              className="flex h-[260px] items-center justify-center text-sm text-error"
            >
              {t('dashboard.viewsFailed')}
            </p>
          ) : isEmpty ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-1 px-4 text-center">
              <p className="text-sm font-medium text-text-secondary">{t('dashboard.viewsEmpty')}</p>
              <p className="text-xs text-text-muted">{t('dashboard.viewsEmptyHint')}</p>
            </div>
          ) : (
            <ViewsChart points={points} series={visibleSeries} t={t} />
          )}
        </div>
      </section>
    </div>
  )
}

export default DashboardOverview
