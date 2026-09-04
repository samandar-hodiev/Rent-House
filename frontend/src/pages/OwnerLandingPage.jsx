import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, KeyRound, MessagesSquare, PencilLine, ShieldCheck } from 'lucide-react'
import Container from '../components/Container'
import { useLocale } from '../context/LocaleContext'
import { useAuth } from '../context/AuthContext'
import { useSiteSettings } from '../context/SiteSettingsContext'
import { fetchApartments } from '../services/apartmentsApi'
import { ROUTES } from '../routes/paths'
import { DISTRICTS } from '../data/districts'

/**
 * What RentHouse offers somebody with a flat to let.
 *
 * The footer has always had a link called "for property owners"; it led to a
 * page that said the owner dashboard would be here one day. The dashboard
 * exists — this is the page that explains it to somebody who has not signed up
 * yet, which is who follows that link.
 *
 * Public on purpose. Putting it behind the sign-in wall would mean the one page
 * whose job is to persuade you to sign up could only be read after you had.
 *
 * The numbers are read from the API, not written here: a landing page with
 * invented figures is an advertisement, and this one has to be true.
 */
function OwnerLandingPage() {
  const { t } = useLocale()
  const { isAuthenticated } = useAuth()
  const { settings } = useSiteSettings()

  const [published, setPublished] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchApartments({ signal: controller.signal, limit: 1 })
      .then((page) => setPublished(page.total))
      .catch(() => {
        // A landing page without a count is still a landing page.
      })
    return () => controller.abort()
  }, [])

  const steps = [
    { icon: PencilLine, key: 'describe' },
    { icon: Camera, key: 'photos' },
    { icon: MessagesSquare, key: 'talk' },
  ]

  const promises = [
    { icon: KeyRound, key: 'free' },
    { icon: ShieldCheck, key: 'moderated' },
  ]

  const primaryTo = isAuthenticated ? ROUTES.createListing : ROUTES.register
  const primaryLabel = isAuthenticated ? t('owner.ctaCreate') : t('owner.ctaJoin')

  return (
    <Container className="pb-16 pt-10 lg:pt-14">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          {t('owner.title')}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-text-secondary">
          {t('owner.subtitle', { city: settings.default_city || t('city.tashkent') })}
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            to={primaryTo}
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {primaryLabel}
          </Link>
          {isAuthenticated ? (
            <Link
              to={ROUTES.dashboardListings}
              className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {t('owner.ctaMyListings')}
            </Link>
          ) : (
            <Link
              to={ROUTES.login}
              className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {t('owner.ctaSignIn')}
            </Link>
          )}
        </div>
      </div>

      {/* Two figures, both read from the API rather than written down. */}
      <dl className="mt-10 grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <div className="rounded-xl border border-border bg-surface p-5">
          <dt className="text-sm text-text-muted">{t('owner.statListings')}</dt>
          <dd className="mt-1 text-2xl font-semibold text-text-primary">
            {published === null ? '—' : published}
          </dd>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <dt className="text-sm text-text-muted">{t('owner.statDistricts')}</dt>
          <dd className="mt-1 text-2xl font-semibold text-text-primary">{DISTRICTS.length}</dd>
        </div>
      </dl>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-text-primary">{t('owner.stepsTitle')}</h2>
        <ol className="mt-5 grid gap-5 sm:grid-cols-3">
          {steps.map(({ icon: Icon, key }, index) => (
            <li key={key} className="rounded-xl border border-border bg-surface p-5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary-light text-primary-hover dark:text-primary">
                <Icon aria-hidden="true" size={17} />
              </span>
              <p className="mt-3 text-xs font-medium text-text-muted">
                {t('owner.stepNumber', { number: index + 1 })}
              </p>
              <h3 className="mt-0.5 text-sm font-semibold text-text-primary">
                {t(`owner.step.${key}.title`)}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
                {t(`owner.step.${key}.body`, {
                  max: settings.listing_max_images,
                  min: settings.listing_min_images,
                })}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 lg:max-w-2xl">
        <h2 className="text-xl font-semibold text-text-primary">{t('owner.promisesTitle')}</h2>
        <ul className="mt-5 flex flex-col gap-4">
          {promises.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-text-secondary">
                <Icon aria-hidden="true" size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-primary">
                  {t(`owner.promise.${key}.title`)}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-text-secondary">
                  {/* The moderation line tells the truth about this
                      marketplace's current setting rather than a general
                      claim: an owner deserves to know whether their listing
                      goes live at once or waits for a check. */}
                  {key === 'moderated'
                    ? t(
                        settings.listing_moderation_required
                          ? 'owner.promise.moderated.on'
                          : 'owner.promise.moderated.off',
                      )
                    : t(`owner.promise.${key}.body`)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-12 rounded-xl border border-border bg-surface p-6 sm:flex sm:items-center sm:justify-between sm:gap-6 lg:max-w-2xl">
        <p className="text-sm text-text-secondary">{t('owner.closing')}</p>
        <Link
          to={primaryTo}
          className="mt-4 inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:mt-0"
        >
          {primaryLabel}
        </Link>
      </div>
    </Container>
  )
}

export default OwnerLandingPage
