import { APARTMENTS } from './apartments'

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString()

// Listing lifecycle. `PENDING`/`APPROVED` come from the documented apartment
// status set; `CLOSED` is the owner-side end state for a listing that is no
// longer offered. Labels live in i18n (`listingStatus.<id>`).
export const LISTING_STATUS = {
  approved: 'APPROVED',
  pending: 'PENDING',
  closed: 'CLOSED',
}

// Semantic tints for a listing status, inside the existing token palette:
// primary for live, warning for awaiting review, muted for closed. Shared by
// the listing card badge and the summary badges so both stay in step.
export const LISTING_STATUS_CLASS = {
  [LISTING_STATUS.approved]: 'bg-primary-light text-primary-hover',
  [LISTING_STATUS.pending]: 'bg-warning/15 text-warning',
  [LISTING_STATUS.closed]: 'bg-surface-secondary text-text-muted',
}

// The signed-in user's own listings. Only the owner-side fields live here —
// the apartment itself (image, title, price, district, rooms, area, floor) is
// referenced by id so there is one source of truth for listing content and no
// second set of images or titles to translate.
const MY_LISTING_META = [
  { apartmentId: 2, status: LISTING_STATUS.approved, createdAt: daysAgo(3), views: 412, saves: 24 },
  { apartmentId: 3, status: LISTING_STATUS.approved, createdAt: daysAgo(8), views: 268, saves: 15 },
  { apartmentId: 5, status: LISTING_STATUS.approved, createdAt: daysAgo(14), views: 190, saves: 9 },
  { apartmentId: 1, status: LISTING_STATUS.approved, createdAt: daysAgo(21), views: 124, saves: 6 },
  { apartmentId: 6, status: LISTING_STATUS.pending, createdAt: daysAgo(1), views: 0, saves: 0 },
  { apartmentId: 4, status: LISTING_STATUS.closed, createdAt: daysAgo(46), views: 903, saves: 41 },
]

// Returns what the UI consumes: one flat object per listing. A real
// `GET /api/v1/users/me/listings` returns the same shape, so swapping the
// source out later does not touch the components.
export function getMyListings() {
  return MY_LISTING_META.map((meta) => {
    const apartment = APARTMENTS.find((item) => item.id === meta.apartmentId)
    return { ...apartment, ...meta, id: meta.apartmentId }
  })
}

export function getMyListingsSummary(listings) {
  return {
    total: listings.length,
    approved: listings.filter((item) => item.status === LISTING_STATUS.approved).length,
    pending: listings.filter((item) => item.status === LISTING_STATUS.pending).length,
    closed: listings.filter((item) => item.status === LISTING_STATUS.closed).length,
  }
}
