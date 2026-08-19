import { useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { useLocale } from '../context/LocaleContext'
import { ROUTES } from '../routes/paths'

function DashboardListingsPage() {
  const { t } = useLocale()
  const navigate = useNavigate()

  return (
    // Fills the dashboard main area (viewport minus the 4rem header and the
    // main padding) so the empty state sits centred in it rather than pinned
    // under the title on a tall screen.
    <section className="flex min-h-[calc(100vh-6rem)] flex-col gap-4 sm:min-h-[calc(100vh-7rem)]">
      <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.listingsTitle')}</h1>

      <div className="flex flex-1 flex-col justify-center">
        <EmptyState
          icon={<Building2 aria-hidden="true" size={28} />}
          title={t('dashboard.listingsEmpty')}
          description={t('dashboard.listingsEmptyHint')}
          actionLabel={t('dashboard.postListing')}
          onAction={() => navigate(ROUTES.createListing)}
        />
      </div>
    </section>
  )
}

export default DashboardListingsPage
