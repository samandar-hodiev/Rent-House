import { Link } from 'react-router-dom'
import { ROUTES } from '../routes/paths'
import { useLocale } from '../context/LocaleContext'
import { useSiteSettings } from '../context/SiteSettingsContext'
import Container from './Container'

function Footer() {
  const { t } = useLocale()
  const { settings } = useSiteSettings()
  const brand = settings.site_brand_name || settings.site_name

  return (
    <footer className="border-t border-border bg-surface">
      {/* The footer is three short blocks; its height came almost entirely from
          padding and gaps rather than from content, so those are what shrink
          here. Type sizes are unchanged. */}
      <Container className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary">{brand}</p>
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

        <div className="shrink-0 text-sm text-text-muted">
          {/* Shown only when the owner has set them: an empty contact line is
              worse than none. */}
          {settings.support_email ? (
            <p>
              <a
                href={`mailto:${settings.support_email}`}
                className="hover:text-primary"
              >
                {settings.support_email}
              </a>
            </p>
          ) : null}
          {settings.support_phone ? (
            <p className="mt-0.5">
              <a
                href={`tel:${settings.support_phone.replace(/\s/g, '')}`}
                className="hover:text-primary"
              >
                {settings.support_phone}
              </a>
            </p>
          ) : null}
          <p className="mt-0.5">{t('footer.copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </Container>
    </footer>
  )
}

export default Footer
