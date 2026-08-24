import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Building2, Check, Loader2, Plus } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import MyListingCard from '../components/dashboard/MyListingCard'
import { useLocale } from '../context/LocaleContext'
import { useListings } from '../context/ListingsContext'
import {
  LISTING_FILTERS,
  LISTING_STATUS_CLASS,
  filterFromSearch,
  getFilterCounts,
} from '../data/listingStatus'
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
  const { listings, isLoading, status, reload } = useListings()
  // Set by the edit form when it navigates back after a successful save.
  const location = useLocation()
  const justSaved = Boolean(location.state?.saved)

  // Which state the sidebar asked for. The counts above stay whole-account
  // figures — they are a summary of everything owned, not of what is filtered
  // below — while the list itself narrows.
  const filter = filterFromSearch(location.search)
  const visible = useMemo(
    () => (filter.status ? listings.filter((item) => item.status === filter.status) : listings),
    [listings, filter.status],
  )

  // Whole-account figures, for the unfiltered breakdown.
  const counts = useMemo(() => getFilterCounts(listings), [listings])

  // A first load has nothing to show yet, and an empty list means something
  // different from "not loaded" — showing the empty state during the request
  // would flash "you have no listings" at someone who has several.
  if (isLoading && listings.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.listingsTitle')}</h1>
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 aria-hidden="true" size={16} className="animate-spin" />
          {t('listing.loading')}
        </p>
      </section>
    )
  }

  if (status === 'error' && listings.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.listingsTitle')}</h1>
        <p role="alert" className="text-sm text-error">
          {t('listing.loadFailed')}
        </p>
        <div>
          <button
            type="button"
            onClick={reload}
            className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('listing.retry')}
          </button>
        </div>
      </section>
    )
  }

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
          <h1 className="text-xl font-semibold text-text-primary">
            {filter.status
              ? t(`dashboard.listingFilter.${filter.key}`)
              : t('dashboard.listingsTitle')}
          </h1>

          {/* The summary describes what is on the page.
              
              It used to list every state's count regardless of the filter, so
              "Kutilmoqda" showed a green "Faol 2" beside a list containing no
              active listings at all — three different answers to the same
              question on one screen. Filtered, there is exactly one badge and
              it is the state being viewed; unfiltered, the whole breakdown is
              the point. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <SummaryItem label={t('dashboard.summaryTotal')} value={visible.length} />
            {filter.status ? (
              <SummaryBadge
                status={filter.status}
                label={t(`listingStatus.${filter.status}`)}
                value={visible.length}
              />
            ) : (
              LISTING_FILTERS.filter((entry) => entry.status && counts[entry.key] > 0).map(
                (entry) => (
                  <SummaryBadge
                    key={entry.key}
                    status={entry.status}
                    label={t(`listingStatus.${entry.status}`)}
                    value={counts[entry.key]}
                  />
                ),
              )
            )}
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
        {visible.map((listing) => (
          <li key={listing.id}>
            <MyListingCard listing={listing} />
          </li>
        ))}
      </ul>

      {/* Having listings but none in this state is a different thing from
          having none at all, and says so rather than reusing the "post your
          first listing" prompt. The wording follows the state, because "no
          drafts" and "nothing deleted" are different pieces of news. */}
      {visible.length === 0 && listings.length > 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">
          {t(`dashboard.empty.${filter.key}`)}
        </p>
      ) : null}
    </section>
  )
}

export default DashboardListingsPage
