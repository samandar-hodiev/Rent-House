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
              {...GROWTH.users[userRange]}
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
              {...GROWTH.listings[listingRange]}
              ariaLabel={t('chart.listingsGrowth')}
              tooltipKey="chart.newListings"
              t={t}
            />
          </div>
        </AdminCard>

        <AdminCard title={t('chart.topDistricts')}>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <BarList items={DISTRICT_STATS} scroll />
          </div>
        </AdminCard>
      </div>
    </div>
  )
}

export default AdminDashboardPage
