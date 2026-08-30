import PagePlaceholder from '../components/PagePlaceholder'
import { useLocale } from '../context/LocaleContext'

function ProfilePage() {
  const { t } = useLocale()

  return (
    <PagePlaceholder
      title={t('placeholder.profile.title')}
      description={t('placeholder.profile.description')}
    />
  )
}

export default ProfilePage
