import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import MyListingCard from '../components/dashboard/MyListingCard'
import { useLocale } from '../context/LocaleContext'
import { getMyListings, getMyListingsSummary } from '../data/myListings'
import { ROUTES } from '../routes/paths'

function SummaryItem({ label, value }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-text-muted">{label}:</span>
      <span className="font-medium text-text-primary">{value}</span>
    </span>
  )
}

function DashboardListingsPage() {
  const { t } = useLocale()
  const navigate = useNavigate()

  // Mock source for now; a real `GET /api/v1/users/me/listings` returns the
  // same shape, so only this line changes.
  const listings = useMemo(() => getMyListings(), [])
  const summary = useMemo(() => getMyListingsSummary(listings), [listings])

  if (listings.length === 0) {
    return (
      <section className="flex min-h-[calc(100vh-6rem)] flex-col gap-4 sm:min-h-[calc(100vh-7rem)]">
        <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.listingsTitle')}</h1>

        <div className="flex flex-1 flex-col justify-center">
          <EmptyState
            icon={<Building2 aria-hidden="true" size={28} />}
            title={t('dashboard.listingsEmpty')}
            description={t('dashboard.listingsEmptyHint')}
            actionLabel={t('dashboard.postListing')}
            onAction={() => navigate(ROUTES.createListing)}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.listingsTitle')}</h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <SummaryItem label={t('dashboard.summaryTotal')} value={summary.total} />
            <SummaryItem label={t('listingStatus.APPROVED')} value={summary.approved} />
            <SummaryItem label={t('listingStatus.PENDING')} value={summary.pending} />
            <SummaryItem label={t('listingStatus.CLOSED')} value={summary.closed} />
          </div>
        </div>

        <Link
          to={ROUTES.createListing}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus aria-hidden="true" size={16} />
          {t('dashboard.postListing')}
        </Link>
      </div>

      {/* A single readable column rather than a grid: these rows carry more
          metadata than a public apartment card and need the width. */}
      <ul className="flex max-w-3xl flex-col gap-3">
        {listings.map((listing) => (
          <li key={listing.id}>
            <MyListingCard listing={listing} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export default DashboardListingsPage
