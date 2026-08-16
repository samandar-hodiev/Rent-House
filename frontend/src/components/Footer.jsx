import { Link } from 'react-router-dom'
import { ROUTES } from '../routes/paths'
import { useLocale } from '../context/LocaleContext'
import Container from './Container'

function Footer() {
  const { t } = useLocale()

  return (
    <footer className="border-t border-border bg-surface">
      <Container className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">{t('brand.name')}</p>
          <p className="mt-1 text-sm text-text-muted">{t('footer.tagline')}</p>
        </div>

        <nav aria-label="Qo'shimcha havolalar" className="flex gap-5">
          <Link to={ROUTES.search} className="text-sm text-text-secondary hover:text-primary">
            {t('footer.linkSearch')}
          </Link>
          <Link to={ROUTES.map} className="text-sm text-text-secondary hover:text-primary">
            {t('footer.linkMap')}
          </Link>
          <Link to={ROUTES.owner} className="text-sm text-text-secondary hover:text-primary">
            {t('footer.linkOwner')}
          </Link>
        </nav>

        <p className="text-sm text-text-muted">
          {t('footer.copyright', { year: new Date().getFullYear() })}
        </p>
      </Container>
    </footer>
  )
}

export default Footer
