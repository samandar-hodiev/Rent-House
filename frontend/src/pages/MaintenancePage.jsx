import { RefreshCw, Wrench } from 'lucide-react'
import { useSiteSettings } from '../context/SiteSettingsContext'
import { useLocale } from '../context/LocaleContext'

/**
 * What a visitor sees while the marketplace is closed for work.
 *
 * Its own page rather than a banner: the site is not partly available, and a
 * header with a search bar that refuses every search would be worse than
 * saying plainly that it is closed. The message is the owner's, from the
 * settings page; the fallback is used only when they left it empty.
 *
 * This is the courteous half. The other half is the server, which refuses the
 * same requests with 503 — so a visitor who types a URL, or a script that skips
 * the interface entirely, meets the same closure.
 */
function MaintenancePage() {
  const { settings, reload } = useSiteSettings()
  const { t } = useLocale()

  const message = settings.maintenance_message?.trim()

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-warning/15 text-warning">
          <Wrench aria-hidden="true" size={26} />
        </span>

        <p className="mt-6 text-sm font-semibold tracking-tight text-text-primary">
          {settings.site_brand_name || settings.site_name || 'RentHouse'}
        </p>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
          {t('maintenance.title')}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          {message || t('maintenance.body')}
        </p>

        <button
          type="button"
          onClick={() => reload()}
          className="mt-7 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <RefreshCw aria-hidden="true" size={15} />
          {t('maintenance.retry')}
        </button>

        {settings.support_email ? (
          <p className="mt-6 text-xs text-text-muted">
            {t('maintenance.support')}{' '}
            <a
              href={`mailto:${settings.support_email}`}
              className="text-primary hover:text-primary-hover"
            >
              {settings.support_email}
            </a>
          </p>
        ) : null}
      </div>
    </main>
  )
}

export default MaintenancePage
