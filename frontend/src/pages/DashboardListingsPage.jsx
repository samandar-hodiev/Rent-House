import { useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { useLocale } from '../context/LocaleContext'
import { ROUTES } from '../routes/paths'

function DashboardListingsPage() {
  const { t } = useLocale()
  const navigate = useNavigate()

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.listingsTitle')}</h1>
      <EmptyState
        icon={<Building2 aria-hidden="true" size={28} />}
        title={t('dashboard.listingsEmpty')}
        description={t('dashboard.listingsEmptyHint')}
        actionLabel={t('dashboard.postListing')}
        onAction={() => navigate(ROUTES.createListing)}
      />
    </section>
  )
}

export default DashboardListingsPage
