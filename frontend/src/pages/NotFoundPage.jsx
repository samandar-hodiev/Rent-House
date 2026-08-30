import { Link } from 'react-router-dom'
import { ROUTES } from '../routes/paths'
import Container from '../components/Container'
import { useLocale } from '../context/LocaleContext'

function NotFoundPage() {
  const { t } = useLocale()

  return (
    <Container className="py-16 text-center">
      <h1 className="text-2xl font-semibold text-text-primary">{t('notFound.title')}</h1>
      <p className="mt-2 text-text-secondary">{t('notFound.body')}</p>
      <Link
        to={ROUTES.home}
        className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t('notFound.action')}
      </Link>
    </Container>
  )
}

export default NotFoundPage
