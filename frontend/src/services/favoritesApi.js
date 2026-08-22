// Saved apartments and the dashboard's first paint.
//
// Saved listings used to live in localStorage, which meant they vanished on a
// new device and could not be counted anywhere but in the browser holding them.
// They are rows in `favorites` now — a table that has existed since the first
// migration and until now had nothing reading it.
import { request } from './apiClient'
import { toApartment } from './apartmentsApi'

/** The user's saved listings, most recently saved first. */
export async function fetchFavorites({ token, signal } = {}) {
  const data = await request('/me/favorites', { token, signal })
  return {
    items: (data.items ?? []).map(toApartment),
    total: data.total ?? 0,
    // Every saved id, including listings not in `items` because they have since
    // been withdrawn. The heart on a card reads this.
    savedIds: data.saved_ids ?? [],
  }
}

/** Saves a listing. Idempotent — saving twice is not an error. */
export function saveFavorite(apartmentId, { token, signal } = {}) {
  return request(`/me/favorites/${apartmentId}`, { method: 'POST', token, signal })
}

/** Unsaves a listing. Also idempotent. */
export function unsaveFavorite(apartmentId, { token, signal } = {}) {
  return request(`/me/favorites/${apartmentId}`, { method: 'DELETE', token, signal })
}

/**
 * Everything the dashboard's first paint needs, in one request.
 *
 * Three counters and two short lists. Fetched together because the page shows
 * them together: four separate requests would mean four round trips before
 * anything above the fold is correct.
 */
export async function fetchDashboardSummary({ token, signal } = {}) {
  const data = await request('/me/dashboard/summary', { token, signal })
  return {
    counts: {
      activeListings: data.counts?.active_listings ?? 0,
      totalListings: data.counts?.total_listings ?? 0,
      unreadMessages: data.counts?.unread_messages ?? 0,
      savedApartments: data.counts?.saved_apartments ?? 0,
    },
    recentListings: (data.recent_listings ?? []).map(toApartment),
    recentSaved: (data.recent_saved ?? []).map(toApartment),
  }
}
