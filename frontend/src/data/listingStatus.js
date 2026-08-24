// The listing lifecycle, as the API defines it.
//
// These values are the ones stored in PostgreSQL and enforced by a CHECK
// constraint, so the UI uses them verbatim rather than translating into a
// second vocabulary — a mapping between "APPROVED" and "active" would be one
// more thing to keep in step, and one more place for a status to go missing.
//
// Labels live in i18n under `listingStatus.<value>`.
export const LISTING_STATUS = {
  draft: 'draft',
  pending: 'pending',
  active: 'active',
  closed: 'closed',
}

// Semantic tints inside the existing token palette: primary for live, warning
// for awaiting review, muted for a draft or a withdrawn listing. Shared by the
// listing card badge and the dashboard summary so both stay in step.
export const LISTING_STATUS_CLASS = {
  [LISTING_STATUS.active]: 'bg-primary-light text-primary-hover dark:text-primary',
  [LISTING_STATUS.pending]: 'bg-warning/15 text-warning',
  [LISTING_STATUS.draft]: 'bg-surface-secondary text-text-muted',
  [LISTING_STATUS.closed]: 'bg-surface-secondary text-text-muted',
}

/** Counts by status, for the dashboard's summary badges. */
export function getMyListingsSummary(listings) {
  const count = (status) => listings.filter((item) => item.status === status).length
  return {
    total: listings.length,
    active: count(LISTING_STATUS.active),
    draft: count(LISTING_STATUS.draft),
    pending: count(LISTING_STATUS.pending),
    closed: count(LISTING_STATUS.closed),
  }
}

// The sidebar's "listing status" group, and the filter the listings page
// applies. Declared once so the two cannot drift: the nav renders this list,
// and the page reads the same `status` values out of the query string.
//
// `status: null` is "all", which applies no filter at all.
//
// Only the four statuses the database actually stores appear here. A menu
// entry for a state the API can never return would be a permanently empty
// page, which is worse than not offering it.
export const LISTING_FILTERS = [
  { key: 'all', status: null },
  { key: 'active', status: LISTING_STATUS.active },
  { key: 'pending', status: LISTING_STATUS.pending },
  { key: 'closed', status: LISTING_STATUS.closed },
  { key: 'draft', status: LISTING_STATUS.draft },
]

/**
 * Reads the filter out of a query string.
 *
 * Anything unrecognised falls back to "all" rather than showing nothing: a
 * hand-edited or stale URL should land somewhere useful.
 */
export function filterFromSearch(search) {
  const requested = new URLSearchParams(search).get('status')
  return LISTING_FILTERS.find((filter) => filter.status === requested) ?? LISTING_FILTERS[0]
}

/** Counts for each entry in `LISTING_FILTERS`, keyed the same way. */
export function getFilterCounts(listings) {
  const counts = {}
  for (const filter of LISTING_FILTERS) {
    counts[filter.key] = filter.status
      ? listings.filter((item) => item.status === filter.status).length
      : listings.length
  }
  return counts
}
