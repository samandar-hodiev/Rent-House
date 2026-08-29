import { useEffect, useState } from 'react'
import {
  Building2, CheckCircle2, Clock, Flag, Loader2, UserPlus, Users, XCircle, Activity,
} from 'lucide-react'
import { AdminCard, PageHeading, StatCard } from '../../components/admin/adminUi'
import { BarList, LineChart, periodLabel } from '../../components/admin/AdminChart'
import EmptyState from '../../components/EmptyState'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import {
  fetchDashboardGrowth, fetchDashboardStats, fetchDistrictActivity,
} from '../../services/adminApi'

const RANGES = ['daily', 'weekly', 'monthly']

function RangeTabs({ value, onChange, t }) {
  return (
    <div className="flex gap-1">
      {RANGES.map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onChange(range)}
          aria-pressed={value === range}
          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            value === range
              ? 'bg-primary-light text-primary-hover dark:text-primary'
              : 'text-text-muted hover:bg-surface-secondary hover:text-text-primary'
          }`}
        >
          {t(`chart.${range}`)}
        </button>
      ))}
    </div>
  )
}

/**
 * Turns a server series into what the chart draws.
 *
 * The chart takes labels and values; the API sends periods and counts. The
 * translation happens here so neither side has to know about the other.
 */
function toChart(points, range, t) {
  return {
    labels: points.map((p) => periodLabel(p.period, range, t)),
    values: points.map((p) => p.count),
  }
}

/**
 * The dashboard. Every figure on it is counted by the database.
 *
 * Three requests, made once: the headline figures, both growth charts at every
 * granularity, and the district ranking. Switching a chart's range is then a
 * local change rather than another round trip.
 */
function AdminDashboardPage() {
  const { t } = useAdmin()
  const { token } = useAdminAuth()

  const [userRange, setUserRange] = useState('daily')
  const [listingRange, setListingRange] = useState('daily')
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    Promise.all([
      fetchDashboardStats({ token, signal: controller.signal }),
      fetchDashboardGrowth({ token, signal: controller.signal }),
      fetchDistrictActivity({ token, signal: controller.signal }),
    ])
      .then(([stats, growth, districts]) => {
        if (cancelled) return
        setData({ stats, growth, districts })
        setState('ready')
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return
        setState('error')
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token])

  if (state === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 aria-hidden="true" size={22} className="animate-spin text-text-muted" />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <EmptyState
        icon={<Activity aria-hidden="true" size={28} />}
        title={t('dashboard.loadFailed')}
        description={t('login.errorNetwork')}
      />
    )
  }

  const { stats, growth, districts } = data
  const cards = [
    { icon: <Users size={17} />, key: 'totalUsers', value: stats.totalUsers },
    { icon: <Activity size={17} />, key: 'activeUsers', value: stats.activeUsers },
    { icon: <Building2 size={17} />, key: 'totalListings', value: stats.totalListings },
    { icon: <CheckCircle2 size={17} />, key: 'activeListings', value: stats.activeListings },
    { icon: <Clock size={17} />, key: 'pendingListings', value: stats.pendingListings },
    { icon: <XCircle size={17} />, key: 'closedListings', value: stats.closedListings },
    { icon: <Flag size={17} />, key: 'reports', value: stats.reports },
    { icon: <UserPlus size={17} />, key: 'newUsersToday', value: stats.newUsersToday },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t('page.dashboard.title')}
        description={t('page.dashboard.description')}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.key} icon={card.icon} label={t(`stat.${card.key}`)} value={card.value} />
        ))}
      </div>

      {/* The row stretches, which is the grid default: all three cards end at
          the same line. The district list is the tallest of them, and the two
          charts grow into that height rather than leaving it empty. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <AdminCard
          title={t('chart.usersGrowth')}
          action={<RangeTabs value={userRange} onChange={setUserRange} t={t} />}
        >
          <div className="flex min-h-[20rem] flex-1 flex-col p-4">
            <LineChart
              {...toChart(growth.users[userRange], userRange, t)}
              ariaLabel={t('chart.usersGrowth')}
              tooltipKey="chart.newUsers"
              t={t}
            />
          </div>
        </AdminCard>

        <AdminCard
          title={t('chart.listingsGrowth')}
          action={<RangeTabs value={listingRange} onChange={setListingRange} t={t} />}
        >
          <div className="flex min-h-[20rem] flex-1 flex-col p-4">
            <LineChart
              {...toChart(growth.listings[listingRange], listingRange, t)}
              ariaLabel={t('chart.listingsGrowth')}
              tooltipKey="chart.newListings"
              t={t}
            />
          </div>
        </AdminCard>

        <AdminCard title={t('chart.topDistricts')}>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <BarList items={districts} scroll />
          </div>
        </AdminCard>
      </div>
    </div>
  )
}

export default AdminDashboardPage
