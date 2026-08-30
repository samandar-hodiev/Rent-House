import PagePlaceholder from '../components/PagePlaceholder'
import { useLocale } from '../context/LocaleContext'

function OwnerDashboardPage() {
  const { t } = useLocale()

  return (
    <PagePlaceholder
      title={t('placeholder.owner.title')}
      description={t('placeholder.owner.description')}
    />
  )
}

export default OwnerDashboardPage
