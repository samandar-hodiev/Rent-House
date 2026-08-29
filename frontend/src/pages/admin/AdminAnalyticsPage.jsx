import { useCallback, useEffect, useState } from 'react'
import { Activity } from 'lucide-react'
import { AdminCard, PageHeading, StatCard } from '../../components/admin/adminUi'
import { BarList, LineChart, periodLabel } from '../../components/admin/AdminChart'
import EmptyState from '../../components/EmptyState'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import {
  fetchDashboardGrowth, fetchDashboardStats, fetchDistrictActivity,
} from '../../services/adminApi'

/** A figure still on its way. Never a placeholder number. */
function StatSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
      <span className="size-9 shrink-0 animate-pulse rounded-lg bg-surface-secondary" />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="h-3 w-2/3 animate-pulse rounded bg-surface-secondary" />
        <span className="h-5 w-1/3 animate-pulse rounded bg-surface-secondary" />
      </span>
    </div>
  )
}

function Group({ title, items, loading }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {loading
          ? items.map((key) => <StatSkeleton key={key} />)
          : items.map(([label, value]) => (
              <StatCard key={label} label={label} value={value} />
            ))}
      </div>
    </div>
  )
}

// Axis labels come from the bucket the server reported, so a month is the month
// PostgreSQL grouped by rather than a name the client made up.
function toChart(points, t) {
  return {
    labels: points.map((p) => periodLabel(p.period, 'monthly', t)),
    values: points.map((p) => p.count),
  }
}

/**
 * The analytics page. Every figure on it is counted by PostgreSQL.
 *
 * It asks the same three endpoints the dashboard asks, and the headline figures
 * come from the very same query — so "Jami foydalanuvchilar" here and on the
 * dashboard cannot drift apart, because there is only one place that counts.
 *
 * Three requests, made once. Aggregation happens in the database: the browser
 * never receives a list of users in order to say how many there are.
 */
function AdminAnalyticsPage() {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')

  const load = useCallback(
    async (signal) => {
      setState('loading')
      try {
        const [stats, growth, districts] = await Promise.all([
          fetchDashboardStats({ token, signal }),
          fetchDashboardGrowth({ token, signal }),
          fetchDistrictActivity({ token, signal }),
        ])
        setData({ stats, growth, districts })
        setState('ready')
      } catch (error) {
        if (error?.name === 'AbortError') return
        setState('error')
      }
    },
    [token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (state === 'error') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeading
          title={t('page.analytics.title')}
          description={t('page.analytics.description')}
        />
        {/* No stale or invented figures behind the message: if the numbers
            could not be fetched, none are shown. */}
        <EmptyState
          icon={<Activity aria-hidden="true" size={28} />}
          title={t('dashboard.loadFailed')}
          description={t('login.errorNetwork')}
          actionLabel={t('analytics.retry')}
          onAction={() => load()}
        />
      </div>
    )
  }

  const loading = state === 'loading'
  const stats = data?.stats
  const districts = data?.districts ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title={t('page.analytics.title')}
        description={t('page.analytics.description')}
      />

      <Group
        title={t('group.users')}
        loading={loading}
        items={
          loading
            ? ['a', 'b', 'c', 'd']
            : [
                [t('stat.totalUsers'), stats.totalUsers],
                [t('analytics.newUsers30d'), stats.newUsers30d],
                [t('stat.activeUsers'), stats.activeUsers],
                [t('stat.blockedUsers'), stats.blockedUsers],
              ]
        }
      />

      <Group
        title={t('group.listings')}
        loading={loading}
        items={
          loading
            ? ['a', 'b', 'c', 'd', 'e']
            : [
                [t('stat.totalListings'), stats.totalListings],
                [t('status.active'), stats.activeListings],
                [t('status.pending'), stats.pendingListings],
                [t('status.closed'), stats.closedListings],
                [t('stat.drafts'), stats.draftListings],
              ]
        }
      />

      <Group
        title={t('group.engagement')}
        loading={loading}
        items={
          loading
            ? ['a', 'b', 'c', 'd']
            : [
                [t('stat.views'), stats.views],
                [t('stat.favorites'), stats.saves],
                [t('stat.chats'), stats.chats],
                [t('stat.contacts'), stats.contacts],
              ]
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <AdminCard title={t('chart.usersGrowth')}>
          <div className="flex min-h-[20rem] flex-1 flex-col p-4">
            {loading ? (
              <span className="flex-1 animate-pulse rounded-lg bg-surface-secondary" />
            ) : (
              <LineChart
                {...toChart(data.growth.users.monthly, t)}
                ariaLabel={t('chart.usersGrowth')}
                tooltipKey="chart.newUsers"
                t={t}
              />
            )}
          </div>
        </AdminCard>

        <AdminCard title={t('chart.listingsGrowth')}>
          <div className="flex min-h-[20rem] flex-1 flex-col p-4">
            {loading ? (
              <span className="flex-1 animate-pulse rounded-lg bg-surface-secondary" />
            ) : (
              <LineChart
                {...toChart(data.growth.listings.monthly, t)}
                ariaLabel={t('chart.listingsGrowth')}
                tooltipKey="chart.newListings"
                t={t}
              />
            )}
          </div>
        </AdminCard>

        <AdminCard title={t('chart.districtStats')}>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            {loading ? (
              <span className="min-h-[16rem] flex-1 animate-pulse rounded-lg bg-surface-secondary" />
            ) : districts.length === 0 ? (
              <p className="flex flex-1 items-center justify-center text-sm text-text-muted">
                {t('analytics.noData')}
              </p>
            ) : (
              <BarList items={districts} scroll />
            )}
          </div>
        </AdminCard>
      </div>
    </div>
  )
}

export default AdminAnalyticsPage
