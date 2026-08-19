import { Settings } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { useLocale } from '../context/LocaleContext'

function DashboardSettingsPage() {
  const { t } = useLocale()

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.settingsTitle')}</h1>
      <EmptyState
        icon={<Settings aria-hidden="true" size={28} />}
        title={t('dashboard.settingsEmpty')}
        description={t('dashboard.settingsEmptyHint')}
      />
    </section>
  )
}

export default DashboardSettingsPage
