import PagePlaceholder from '../components/PagePlaceholder'
import { useLocale } from '../context/LocaleContext'

function SearchPage() {
  const { t } = useLocale()

  return (
    <PagePlaceholder
      title={t('placeholder.search.title')}
      description={t('placeholder.search.description')}
    />
  )
}

export default SearchPage
