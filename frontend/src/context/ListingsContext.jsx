import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import {
  changeApartmentStatus as changeApartmentStatusRequest,
  createApartment as createApartmentRequest,
  deleteApartment as deleteApartmentRequest,
  fetchMyApartments,
  updateApartment as updateApartmentRequest,
} from '../services/apartmentsApi'

const ListingsContext = createContext(null)

// Holds the signed-in user's listings, loaded from the API.
//
// PostgreSQL is the source of truth: this is a cache of what the server last
// said, kept so "Mening e'lonlarim" and the edit form read the same objects and
// so a save updates the card behind it without a refetch. Every mutation goes
// to the server first and only then to this state — an optimistic update that
// the server rejected would leave the screen showing something that does not
// exist.
export function ListingsProvider({ children }) {
  const { token, isAuthenticated } = useAuth()

  const [listings, setListings] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)

  const load = useCallback(
    async (signal) => {
      if (!token) {
        setListings([])
        setStatus('idle')
        return
      }

      setStatus('loading')
      setError(null)
      try {
        // The whole set, not a page: an owner's dashboard is small, and the
        // count shown on the overview has to be the real one.
        const page = await fetchMyApartments({ token, signal, limit: 60 })
        setListings(page.items)
        setStatus('ready')
      } catch (requestError) {
        if (requestError?.name === 'AbortError') return
        setError(requestError)
        setStatus('error')
      }
    },
    [token],
  )

  // Reloads when the session changes: signing out must not leave the previous
  // account's listings on screen.
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const getListing = useCallback(
    (id) => listings.find((listing) => String(listing.id) === String(id)) ?? null,
    [listings],
  )

  const createListing = useCallback(
    async (payload) => {
      const created = await createApartmentRequest(payload, { token })
      setListings((current) => [created, ...current])
      return created
    },
    [token],
  )

  const updateListing = useCallback(
    async (id, payload) => {
      const updated = await updateApartmentRequest(id, payload, { token })
      setListings((current) =>
        current.map((listing) => (String(listing.id) === String(id) ? updated : listing)),
      )
      return updated
    },
    [token],
  )

  // Deleting is a status change on the server — the row stays so the
  // conversations, saved listings and view history pointing at it survive — so
  // the listing is updated in place here rather than dropped. It leaves the
  // active lists because those filter by status, not because it stopped
  // existing.
  const removeListing = useCallback(
    async (id) => {
      await deleteApartmentRequest(id, { token })
      setListings((current) =>
        current.map((listing) =>
          String(listing.id) === String(id) ? { ...listing, status: 'deleted' } : listing,
        ),
      )
    },
    [token],
  )

  /** Moves a listing through its lifecycle and keeps the cached copy in step. */
  const changeListingStatus = useCallback(
    async (id, status) => {
      const updated = await changeApartmentStatusRequest(id, status, { token })
      setListings((current) =>
        current.map((listing) => (String(listing.id) === String(id) ? updated : listing)),
      )
      return updated
    },
    [token],
  )

  const value = useMemo(
    () => ({
      listings,
      status,
      error,
      isLoading: status === 'loading',
      isAuthenticated,
      getListing,
      createListing,
      updateListing,
      removeListing,
      changeListingStatus,
      reload: () => load(),
    }),
    [
      listings,
      changeListingStatus,
      status,
      error,
      isAuthenticated,
      getListing,
      createListing,
      updateListing,
      removeListing,
      load,
    ],
  )

  return <ListingsContext.Provider value={value}>{children}</ListingsContext.Provider>
}

export function useListings() {
  const context = useContext(ListingsContext)
  if (!context) throw new Error('useListings must be used inside ListingsProvider')
  return context
}
