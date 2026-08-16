import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const STORAGE_KEY = 'renthouse_wishlist'

function readStoredWishlist() {
  if (typeof window === 'undefined') return new Map()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const entries = JSON.parse(raw)
    if (!Array.isArray(entries)) return new Map()
    return new Map(entries)
  } catch {
    return new Map()
  }
}

const WishlistContext = createContext(null)

export function WishlistProvider({ children }) {
  const [savedItems, setSavedItems] = useState(readStoredWishlist)

  const persist = (map) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.entries())))
  }

  const toggleWishlist = useCallback((id) => {
    setSavedItems((current) => {
      const next = new Map(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.set(id, new Date().toISOString())
      }
      persist(next)
      return next
    })
  }, [])

  const isSaved = useCallback((id) => savedItems.has(id), [savedItems])
  const getSavedAt = useCallback((id) => savedItems.get(id) ?? null, [savedItems])

  const value = useMemo(
    () => ({
      savedItems,
      savedCount: savedItems.size,
      toggleWishlist,
      isSaved,
      getSavedAt,
    }),
    [savedItems, toggleWishlist, isSaved, getSavedAt],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const context = useContext(WishlistContext)
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider')
  }
  return context
}
