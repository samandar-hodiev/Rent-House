import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Home } from 'lucide-react'
import ApartmentCard from '../components/ApartmentCard'
import ApartmentCardSkeleton from '../components/ApartmentCardSkeleton'
import { useWishlist } from '../context/WishlistContext'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { fetchFavorites } from '../services/favoritesApi'
import { ROUTES } from '../routes/paths'

// Columns follow the width this grid actually gets, not the window's.
//
// The page sits inside the dashboard, beside a sidebar, so the viewport says
// very little about how much room the cards have — a 1440px window leaves the
// grid about 1170px. Container queries ask the container, which is the thing
// that decides how many cards fit.
//
// Five across a wide monitor, four on an ordinary desktop, three on a laptop,
// two on a tablet, one on a phone.
//
// The steps are placed by the room the grid actually has rather than by round
// window sizes. A 1440px window leaves this grid 1168px and a 1600px one leaves
// 1296px — a bigger gap than it looks, because the dashboard sidebar itself
// widens at 2xl — so the fourth column lands at 1250px between them. The fifth
// waits until 1650px: a 1920px window leaves 1616px and keeps four, while
// anything wider would otherwise stretch four cards past 400px each and the row
// starts looking like a row of billboards.
// The variants query the nearest *ancestor* container, so the element that
// declares `@container` cannot be the same one that reacts to it — the grid
// lives inside a wrapper that is the container.
const SAVED_GRID =
  'grid grid-cols-1 gap-4 @[560px]:grid-cols-2 @[900px]:grid-cols-3 @[900px]:gap-5 @[1250px]:grid-cols-4 @[1650px]:grid-cols-5'

const SKELETON_COUNT = 8

function WishlistPage() {
  const { t } = useLocale()
  const navigate = useNavigate()
  const { savedCount } = useWishlist()
  const { token } = useAuth()

  // One request for the whole list, ordered by when each was saved. This used
  // to be one fetch per saved id, which meant twenty listings were twenty
  // round trips; the server joins them now and returns only listings that are
  // still published.
  const [savedApartments, setSavedApartments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setSavedApartments([])
      setLoading(false)
      return undefined
    }

    const controller = new AbortController()
    setLoading(true)
    fetchFavorites({ token, signal: controller.signal })
      .then((saved) => {
        if (!controller.signal.aborted) setSavedApartments(saved.items)
      })
      .catch(() => {
        if (!controller.signal.aborted) setSavedApartments([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
    // `savedCount` re-runs this after a heart is toggled elsewhere on the page,
    // so unsaving a listing removes its card rather than leaving it behind.
  }, [token, savedCount])

  // No filtering and no sorting: the server returns them in the order they
  // were saved, which is the order somebody expects their own list in.
  const apartments = savedApartments

  if (!loading && savedApartments.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
          {t('header.wishlistNav')}
        </h1>
        <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
          <div className="relative flex size-16 items-center justify-center rounded-full bg-primary-light">
            <Home aria-hidden="true" size={30} strokeWidth={1.75} className="text-primary" />
            <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-surface ring-2 ring-surface">
              <Heart aria-hidden="true" size={13} className="fill-primary text-primary" />
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold text-text-primary">
              {t('wishlist.emptyTitle')}
            </h2>
            <p className="text-sm text-text-secondary">{t('wishlist.emptyDescription')}</p>
          </div>

          <button
            type="button"
            onClick={() => navigate(ROUTES.home)}
            className="mt-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('wishlist.emptyAction')}
          </button>
        </div>
      </section>
    )
  }

  return (
    // No `Container` here: the dashboard's main area already provides the
    // padding, and nesting a second centred wrapper inside it added a margin
    // the page did not need and pushed the title down the screen.
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
          {t('header.wishlistNav')}
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          {t('wishlist.resultCount', { count: apartments.length })}
        </p>
      </div>

      <div className="@container">
        <div className={SAVED_GRID}>
        {loading && apartments.length === 0
          ? Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <ApartmentCardSkeleton key={index} />
            ))
          : apartments.map((apartment) => (
              <ApartmentCard key={apartment.id} apartment={apartment} />
            ))}
        </div>
      </div>
    </section>
  )
}

export default WishlistPage
