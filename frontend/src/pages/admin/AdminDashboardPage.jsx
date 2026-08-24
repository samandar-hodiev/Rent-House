import { useState } from 'react'
import {
  Building2, CheckCircle2, Clock, Flag, UserPlus, Users, XCircle, Activity,
} from 'lucide-react'
import { AdminCard, PageHeading, StatCard } from '../../components/admin/adminUi'
import { BarList, LineChart } from '../../components/admin/AdminChart'
import { GROWTH, OVERVIEW, TOP_DISTRICTS } from '../../mock/admin'

const RANGES = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

function RangeTabs({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {RANGES.map((range) => (
        <button
          key={range.key}
          type="button"
          onClick={() => onChange(range.key)}
          aria-pressed={value === range.key}
          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            value === range.key
              ? 'bg-primary-light text-primary-hover dark:text-primary'
              : 'text-text-muted hover:bg-surface-secondary hover:text-text-primary'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  )
}

function AdminDashboardPage() {
  const [userRange, setUserRange] = useState('daily')
  const [listingRange, setListingRange] = useState('daily')

  const stats = [
    { icon: <Users size={17} />, label: 'Total Users', value: OVERVIEW.totalUsers },
    { icon: <Activity size={17} />, label: 'Active Users', value: OVERVIEW.activeUsers },
    { icon: <Building2 size={17} />, label: 'Total Listings', value: OVERVIEW.totalListings },
    { icon: <CheckCircle2 size={17} />, label: 'Active Listings', value: OVERVIEW.activeListings },
    { icon: <Clock size={17} />, label: 'Pending Listings', value: OVERVIEW.pendingListings },
    { icon: <XCircle size={17} />, label: 'Closed Listings', value: OVERVIEW.closedListings },
    { icon: <Flag size={17} />, label: 'Reports', value: OVERVIEW.reports },
    { icon: <UserPlus size={17} />, label: 'New Users Today', value: OVERVIEW.newUsersToday },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeading title="Dashboard" description="An overview of RentHouse today." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <AdminCard
          title="Users Growth"
          action={<RangeTabs value={userRange} onChange={setUserRange} />}
          className="xl:col-span-1"
        >
          <div className="p-4">
            <LineChart {...GROWTH.users[userRange]} ariaLabel="Users growth" />
          </div>
        </AdminCard>

        <AdminCard
          title="Listings Growth"
          action={<RangeTabs value={listingRange} onChange={setListingRange} />}
          className="xl:col-span-1"
        >
          <div className="p-4">
            <LineChart {...GROWTH.listings[listingRange]} ariaLabel="Listings growth" />
          </div>
        </AdminCard>

        <AdminCard title="Top Districts" className="xl:col-span-1">
          <div className="p-4">
            <BarList items={TOP_DISTRICTS} />
          </div>
        </AdminCard>
      </div>
    </div>
  )
}

export default AdminDashboardPage
