import { Link } from 'react-router-dom'
import { ROUTES } from '../routes/paths'
import { useLocale } from '../context/LocaleContext'
import Container from './Container'

function Footer() {
  const { t } = useLocale()

  return (
    <footer className="border-t border-border bg-surface">
      {/* The footer is three short blocks; its height came almost entirely from
          padding and gaps rather than from content, so those are what shrink
          here. Type sizes are unchanged. */}
      <Container className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">{t('brand.name')}</p>
          <p className="mt-0.5 text-sm text-text-muted">{t('footer.tagline')}</p>
        </div>

        <nav aria-label="Qo'shimcha havolalar" className="flex flex-wrap gap-x-5 gap-y-1">
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

        <p className="shrink-0 text-sm text-text-muted">
          {t('footer.copyright', { year: new Date().getFullYear() })}
        </p>
      </Container>
    </footer>
  )
}

export default Footer
