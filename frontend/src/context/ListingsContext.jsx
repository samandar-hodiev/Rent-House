import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { getMyListings } from '../data/myListings'

const ListingsContext = createContext(null)

// Holds the signed-in user's listings so "Mening e'lonlarim" and the edit form
// read and write the same objects — saving an edit updates the card behind it.
// In-memory only: nothing is persisted and no request is sent. This is the seam
// `GET/PATCH /api/v1/apartments/:id` replaces.
export function ListingsProvider({ children }) {
  const [listings, setListings] = useState(getMyListings)

  const getListing = useCallback(
    (id) => listings.find((listing) => String(listing.id) === String(id)) ?? null,
    [listings],
  )

  // `patch` never carries `status`: editing a listing must not move it between
  // Faol / Kutilmoqda / Yopilgan.
  const updateListing = useCallback((id, patch) => {
    setListings((current) =>
      current.map((listing) =>
        String(listing.id) === String(id) ? { ...listing, ...patch, status: listing.status } : listing,
      ),
    )
  }, [])

  const value = useMemo(
    () => ({ listings, getListing, updateListing }),
    [listings, getListing, updateListing],
  )

  return <ListingsContext.Provider value={value}>{children}</ListingsContext.Provider>
}

export function useListings() {
  const context = useContext(ListingsContext)
  if (!context) throw new Error('useListings must be used inside ListingsProvider')
  return context
}
