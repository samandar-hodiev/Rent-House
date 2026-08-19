import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Building2, Check, Plus } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import MyListingCard from '../components/dashboard/MyListingCard'
import { useLocale } from '../context/LocaleContext'
import { useListings } from '../context/ListingsContext'
import { LISTING_STATUS, LISTING_STATUS_CLASS, getMyListingsSummary } from '../data/myListings'
import { ROUTES } from '../routes/paths'

function SummaryItem({ label, value }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-text-muted">{label}:</span>
      <span className="font-medium text-text-primary">{value}</span>
    </span>
  )
}

// The three status counts carry the same semantic tint as the badge on each
// listing card, so a colour means the same thing in both places.
function SummaryBadge({ status, label, value }) {
  return (
    <span
      className={`flex items-baseline gap-1.5 rounded-full px-2.5 py-1 font-medium ${LISTING_STATUS_CLASS[status]}`}
    >
      {label}
      <span>{value}</span>
    </span>
  )
}

function DashboardListingsPage() {
  const { t } = useLocale()
  const navigate = useNavigate()

  // Shared with the edit form, so saving an edit updates the card here.
  const { listings } = useListings()
  // Set by the edit form when it navigates back after a successful save.
  const justSaved = Boolean(useLocation().state?.saved)
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
    // From `lg:` the section is pinned to the viewport (minus the 4rem header
    // and the main padding) and only the list below scrolls, so the title,
    // summary and post action stay put. Below `lg:` the page scrolls normally —
    // nested scrolling on a phone fights the natural gesture.
    <section className="flex flex-col gap-5 lg:h-[calc(100vh-7rem)] lg:overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.listingsTitle')}</h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <SummaryItem label={t('dashboard.summaryTotal')} value={summary.total} />
            <SummaryBadge
              status={LISTING_STATUS.approved}
              label={t('listingStatus.APPROVED')}
              value={summary.approved}
            />
            <SummaryBadge
              status={LISTING_STATUS.pending}
              label={t('listingStatus.PENDING')}
              value={summary.pending}
            />
            <SummaryBadge
              status={LISTING_STATUS.closed}
              label={t('listingStatus.CLOSED')}
              value={summary.closed}
            />
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

      {justSaved ? (
        <p
          role="status"
          className="flex shrink-0 items-center gap-2 rounded-md border border-primary bg-primary-light px-3 py-2.5 text-sm text-primary-hover dark:text-primary"
        >
          <Check aria-hidden="true" size={16} />
          {t('listing.changesSaved')}
        </p>
      ) : null}

      {/* A single readable column rather than a grid: these rows carry more
          metadata than a public apartment card and need the width. */}
      {/* Single column filling the content area. The scrollbar is styled to sit
          quietly in the dashboard rather than as a bright browser default; the
          tokens follow the active theme, so it inverts with dark mode. */}
      <ul className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2 lg:[scrollbar-color:var(--color-border)_transparent] lg:[scrollbar-width:thin] lg:[&::-webkit-scrollbar-thumb]:rounded-full lg:[&::-webkit-scrollbar-thumb]:bg-border lg:[&::-webkit-scrollbar-thumb:hover]:bg-text-muted lg:[&::-webkit-scrollbar-track]:bg-transparent lg:[&::-webkit-scrollbar]:w-2">
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
