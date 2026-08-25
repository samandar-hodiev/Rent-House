import { AdminCard, PageHeading, StatCard } from '../../components/admin/adminUi'
import { BarList, LineChart } from '../../components/admin/AdminChart'
import { useAdmin } from '../../context/AdminSettingsContext'
import { DISTRICT_STATS, GROWTH, OVERVIEW } from '../../mock/admin'

function Group({ title, items }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {items.map(([label, value]) => (
          <StatCard key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  )
}

function AdminAnalyticsPage() {
  const { t } = useAdmin()
  const trendLabel = (trend) => t(`chart.${trend}`)

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title={t('page.analytics.title')}
        description={t('page.analytics.description')}
      />

      <Group
        title={t('group.users')}
        items={[
          [t('stat.totalUsers'), OVERVIEW.totalUsers],
          [t('stat.newUsers'), OVERVIEW.newUsersToday],
          [t('stat.activeUsers'), OVERVIEW.activeUsers],
          [t('stat.blockedUsers'), OVERVIEW.blockedUsers],
        ]}
      />

      <Group
        title={t('group.listings')}
        items={[
          [t('stat.totalListings'), OVERVIEW.totalListings],
          [t('status.active'), OVERVIEW.activeListings],
          [t('status.pending'), OVERVIEW.pendingListings],
          [t('status.closed'), OVERVIEW.closedListings],
          [t('stat.drafts'), OVERVIEW.drafts],
        ]}
      />

      <Group
        title={t('group.engagement')}
        items={[
          [t('stat.views'), OVERVIEW.views],
          [t('stat.favorites'), OVERVIEW.favorites],
          [t('stat.chats'), OVERVIEW.chats],
          [t('stat.contacts'), OVERVIEW.contacts],
        ]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <AdminCard title={t('chart.usersGrowth')}>
          <div className="p-4">
            <LineChart
              {...GROWTH.users.monthly}
              ariaLabel={t('chart.usersGrowth')}
              trendLabel={trendLabel}
            />
          </div>
        </AdminCard>
        <AdminCard title={t('chart.listingsGrowth')}>
          <div className="p-4">
            <LineChart
              {...GROWTH.listings.monthly}
              ariaLabel={t('chart.listingsGrowth')}
              trendLabel={trendLabel}
            />
          </div>
        </AdminCard>
        <AdminCard title={t('chart.districtStats')}>
          <div className="p-4">
            <BarList items={DISTRICT_STATS} scroll />
          </div>
        </AdminCard>
      </div>
    </div>
  )
}

export default AdminAnalyticsPage
