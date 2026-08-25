import { useState } from 'react'
import {
  Building2, CheckCircle2, Clock, Flag, UserPlus, Users, XCircle, Activity,
} from 'lucide-react'
import { AdminCard, PageHeading, StatCard } from '../../components/admin/adminUi'
import { BarList, LineChart } from '../../components/admin/AdminChart'
import { useAdmin } from '../../context/AdminSettingsContext'
import { DISTRICT_STATS, GROWTH, OVERVIEW } from '../../mock/admin'

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

function AdminDashboardPage() {
  const { t } = useAdmin()
  const [userRange, setUserRange] = useState('daily')
  const [listingRange, setListingRange] = useState('daily')

  const stats = [
    { icon: <Users size={17} />, key: 'totalUsers', value: OVERVIEW.totalUsers },
    { icon: <Activity size={17} />, key: 'activeUsers', value: OVERVIEW.activeUsers },
    { icon: <Building2 size={17} />, key: 'totalListings', value: OVERVIEW.totalListings },
    { icon: <CheckCircle2 size={17} />, key: 'activeListings', value: OVERVIEW.activeListings },
    { icon: <Clock size={17} />, key: 'pendingListings', value: OVERVIEW.pendingListings },
    { icon: <XCircle size={17} />, key: 'closedListings', value: OVERVIEW.closedListings },
    { icon: <Flag size={17} />, key: 'reports', value: OVERVIEW.reports },
    { icon: <UserPlus size={17} />, key: 'newUsersToday', value: OVERVIEW.newUsersToday },
  ]

  // The chart names its own direction, so the colour is never the only thing
  // carrying the meaning.
  const trendLabel = (trend) => t(`chart.${trend}`)

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t('page.dashboard.title')}
        description={t('page.dashboard.description')}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.key} icon={stat.icon} label={t(`stat.${stat.key}`)} value={stat.value} />
        ))}
      </div>

      {/* `items-start`: a chart card is shorter than the district list, and
          letting it stretch to match left a band of empty card under the
          line. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
        <AdminCard
          title={t('chart.usersGrowth')}
          action={<RangeTabs value={userRange} onChange={setUserRange} t={t} />}
        >
          <div className="p-4">
            <LineChart
              {...GROWTH.users[userRange]}
              ariaLabel={t('chart.usersGrowth')}
              trendLabel={trendLabel}
            />
          </div>
        </AdminCard>

        <AdminCard
          title={t('chart.listingsGrowth')}
          action={<RangeTabs value={listingRange} onChange={setListingRange} t={t} />}
        >
          <div className="p-4">
            <LineChart
              {...GROWTH.listings[listingRange]}
              ariaLabel={t('chart.listingsGrowth')}
              trendLabel={trendLabel}
            />
          </div>
        </AdminCard>

        <AdminCard title={t('chart.topDistricts')}>
          <div className="p-4">
            <BarList items={DISTRICT_STATS} scroll />
          </div>
        </AdminCard>
      </div>
    </div>
  )
}

export default AdminDashboardPage
