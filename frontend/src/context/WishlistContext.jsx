import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { fetchFavorites, saveFavorite, unsaveFavorite } from '../services/favoritesApi'

const WishlistContext = createContext(null)

/**
 * The signed-in user's saved apartments.
 *
 * Backed by the `favorites` table rather than localStorage, so a wishlist
 * follows the account instead of the browser — saving on a phone and opening
 * the dashboard on a laptop now shows the same list, and the dashboard can
 * count it at all.
 *
 * Saving requires an account. Guests are sent to sign in by `useRequireAuth`
 * before they reach any of this, so there is no anonymous list to merge in
 * afterwards.
 */
export function WishlistProvider({ children }) {
  const { token, status } = useAuth()
  const [savedIds, setSavedIds] = useState(() => new Set())
  const [loaded, setLoaded] = useState(false)

  // Signing in loads the list; signing out drops it, so the next account does
  // not inherit the previous one's hearts.
  useEffect(() => {
    if (!token) {
      setSavedIds(new Set())
      setLoaded(false)
      return undefined
    }

    const controller = new AbortController()
    fetchFavorites({ token, signal: controller.signal })
      .then((saved) => {
        if (controller.signal.aborted) return
        setSavedIds(new Set(saved.savedIds))
        setLoaded(true)
      })
      .catch(() => {
        // A failed load leaves every heart empty rather than wrong in the other
        // direction: offering to save something already saved is recoverable,
        // claiming it is saved when it is not is a lie the user acts on.
      })
    return () => controller.abort()
  }, [token])

  /**
   * Saves or unsaves a listing.
   *
   * The heart flips immediately and is put back if the request fails — a
   * round trip before the icon responds makes the button feel broken.
   */
  const toggleWishlist = useCallback(
    async (id) => {
      if (!id || !token) return

      const wasSaved = savedIds.has(id)
      setSavedIds((current) => {
        const next = new Set(current)
        if (wasSaved) next.delete(id)
        else next.add(id)
        return next
      })

      try {
        await (wasSaved ? unsaveFavorite(id, { token }) : saveFavorite(id, { token }))
      } catch {
        setSavedIds((current) => {
          const next = new Set(current)
          if (wasSaved) next.add(id)
          else next.delete(id)
          return next
        })
      }
    },
    [token, savedIds],
  )

  const isSaved = useCallback((id) => savedIds.has(id), [savedIds])

  const value = useMemo(
    () => ({
      savedIds,
      savedCount: savedIds.size,
      // True once the server's list has arrived. The saved page waits for it
      // rather than flashing an empty state over a list that is on its way.
      loaded: loaded || !token,
      toggleWishlist,
      isSaved,
    }),
    [savedIds, loaded, token, toggleWishlist, isSaved],
  )

  // `status` is read so the provider re-evaluates when a session is restored on
  // a reload, not only when a token first appears.
  void status

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const context = useContext(WishlistContext)
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider')
  }
  return context
}
