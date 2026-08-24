import { AdminCard, PageHeading, StatCard } from '../../components/admin/adminUi'
import { BarList, LineChart } from '../../components/admin/AdminChart'
import { GROWTH, OVERVIEW, TOP_DISTRICTS } from '../../mock/admin'

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
  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Analytics" description="Figures across the whole marketplace." />

      <Group
        title="Users"
        items={[
          ['Total Users', OVERVIEW.totalUsers],
          ['New Users', OVERVIEW.newUsersToday],
          ['Active Users', OVERVIEW.activeUsers],
          ['Blocked Users', OVERVIEW.blockedUsers],
        ]}
      />

      <Group
        title="Listings"
        items={[
          ['Total Listings', OVERVIEW.totalListings],
          ['Active', OVERVIEW.activeListings],
          ['Pending', OVERVIEW.pendingListings],
          ['Closed', OVERVIEW.closedListings],
          ['Drafts', OVERVIEW.drafts],
        ]}
      />

      <Group
        title="Engagement"
        items={[
          ['Views', OVERVIEW.views],
          ['Favorites', OVERVIEW.favorites],
          ['Chats', OVERVIEW.chats],
          ['Listing Contacts', OVERVIEW.contacts],
        ]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <AdminCard title="Users Growth">
          <div className="p-4">
            <LineChart {...GROWTH.users.monthly} ariaLabel="Users growth by month" />
          </div>
        </AdminCard>
        <AdminCard title="Listings Growth">
          <div className="p-4">
            <LineChart {...GROWTH.listings.monthly} ariaLabel="Listings growth by month" />
          </div>
        </AdminCard>
        <AdminCard title="District statistics">
          <div className="p-4">
            <BarList items={TOP_DISTRICTS} />
          </div>
        </AdminCard>
      </div>
    </div>
  )
}

export default AdminAnalyticsPage
