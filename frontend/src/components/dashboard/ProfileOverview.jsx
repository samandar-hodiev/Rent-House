import { Link } from 'react-router-dom'
import { Building2, Eye, MessageSquare } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useAuth } from '../../context/AuthContext'
import { ROUTES } from '../../routes/paths'
import UserAvatar from './UserAvatar'

function StatCard({ icon, label, value }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  )
}

// Account overview — read-only; editing lives on its own dashboard section.
function ProfileOverview() {
  const { t } = useLocale()
  const { user } = useAuth()
  const { name, email, phone, stats } = user

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <UserAvatar name={name} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-text-primary">{name}</h1>
              <p className="mt-1 truncate text-sm text-text-secondary">{email}</p>
              <p className="truncate text-sm text-text-secondary">{phone}</p>
            </div>
          </div>

          <Link
            to={ROUTES.dashboardEditProfile}
            className="shrink-0 rounded-md border border-border bg-surface px-4 py-2 text-center text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('dashboard.editProfile')}
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Building2 aria-hidden="true" size={16} />}
          label={t('dashboard.statActiveListings')}
          value={stats.activeListings}
        />
        <StatCard
          icon={<Eye aria-hidden="true" size={16} />}
          label={t('dashboard.statTotalViews')}
          value={stats.totalViews}
        />
        <StatCard
          icon={<MessageSquare aria-hidden="true" size={16} />}
          label={t('dashboard.statUnreadMessages')}
          value={stats.unreadMessages}
        />
      </section>
    </div>
  )
}

export default ProfileOverview
