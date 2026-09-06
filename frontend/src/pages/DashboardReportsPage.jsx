import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flag, Loader2 } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { useSiteFormat } from '../hooks/useSiteFormat'
import { fetchMyReports } from '../services/apartmentsApi'
import { apartmentDetailsPath } from '../routes/paths'

// Same idea as LISTING_STATUS_CLASS in data/listingStatus.js, but this
// vocabulary is read in exactly one place, so it stays local rather than
// becoming a second shared file for four colours.
const REPORT_STATUS_CLASS = {
  open: 'bg-warning/15 text-warning',
  reviewing: 'bg-warning/15 text-warning',
  resolved: 'bg-primary-light text-primary-hover dark:text-primary',
  dismissed: 'bg-surface-secondary text-text-muted',
}

/**
 * What this account has reported, and what came of it.
 *
 * Read-only and unfiltered on purpose: a person files a handful of these in
 * the lifetime of an account, not enough to need sorting or a search box —
 * the admin dashboard's own report table is the one built for volume.
 */
function DashboardReportsPage() {
  const { t } = useLocale()
  const { token } = useAuth()
  const { formatDate } = useSiteFormat()

  const [reports, setReports] = useState([])
  // 'loading' | 'ready' | 'error' — not derived from `reports.length`, so an
  // empty list after a real load reads as "nothing to show" rather than
  // "still finding out".
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    fetchMyReports({ token, signal: controller.signal, limit: 100 })
      .then((data) => {
        setReports(data.reports)
        setStatus('ready')
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setStatus('error')
      })
    return () => controller.abort()
  }, [token])

  if (status === 'loading') {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.reportsTitle')}</h1>
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 aria-hidden="true" size={16} className="animate-spin" />
          {t('listing.loading')}
        </p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.reportsTitle')}</h1>
        <p role="alert" className="text-sm text-error">
          {t('dashboard.reportsLoadFailed')}
        </p>
      </section>
    )
  }

  if (reports.length === 0) {
    return (
      <section className="flex min-h-[calc(100vh-6rem)] flex-col gap-4 sm:min-h-[calc(100vh-7rem)]">
        <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.reportsTitle')}</h1>
        <div className="flex flex-1 flex-col justify-center">
          <EmptyState
            icon={<Flag aria-hidden="true" size={28} />}
            title={t('dashboard.reportsEmpty')}
            description={t('dashboard.reportsEmptyHint')}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.reportsTitle')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('dashboard.reportsHint')}</p>
      </div>

      <ul className="flex flex-col gap-3">
        {reports.map((report) => (
          <li key={report.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              {/* A link only while the listing is still something a stranger
                  can open — closed or withdrawn, the detail page refuses
                  anybody but the owner, and a link that leads to "not found"
                  is worse than no link. */}
              {report.apartmentStatus === 'active' ? (
                <Link
                  to={apartmentDetailsPath(report.apartmentId)}
                  className="text-sm font-medium text-text-primary hover:text-primary hover:underline"
                >
                  {report.apartmentTitle}
                </Link>
              ) : (
                <span className="text-sm font-medium text-text-muted">{report.apartmentTitle}</span>
              )}
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${REPORT_STATUS_CLASS[report.status]}`}
              >
                {t(`reportStatus.${report.status}`)}
              </span>
            </div>

            <p className="mt-2 text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{t('report.reasonLabel')}:</span>{' '}
              {t(`reportReason.${report.reason}`)}
            </p>
            {report.comment ? <p className="mt-1 text-sm text-text-secondary">{report.comment}</p> : null}

            {report.resolution ? (
              <p className="mt-2 rounded-md bg-surface-secondary px-3 py-2 text-sm text-text-secondary">
                <span className="font-medium text-text-primary">
                  {t('dashboard.reportsResolutionLabel')}:
                </span>{' '}
                {report.resolution}
              </p>
            ) : null}

            <p className="mt-2 text-xs text-text-muted">
              {t('dashboard.reportsSubmittedAt', { date: formatDate(report.createdAt) })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default DashboardReportsPage
