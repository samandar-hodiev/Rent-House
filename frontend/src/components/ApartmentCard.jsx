import { useNavigate } from 'react-router-dom'
import { MapPin, Map } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'
import { useWishlist } from '../context/WishlistContext'
import { useRequireAuth } from '../hooks/useRequireAuth'
import { getDistrictById, districtNameKey } from '../data/districts'
import { listingTitle } from '../utils/listingText'
import { apartmentDetailsPath } from '../routes/paths'
import { formatListingPrice } from '../utils/formatPrice'
import { formatPostedAt } from '../utils/formatRelativeTime'

function HeartIcon({ filled }) {
  if (filled) {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
        <path d="M9.653 16.915a.75.75 0 0 0 .694 0c.966-.502 1.916-1.032 2.79-1.657 2.514-1.8 4.613-4.15 4.613-7.15 0-2.223-1.734-3.958-3.87-3.958-1.269 0-2.4.62-3.13 1.596-.73-.977-1.86-1.596-3.13-1.596-2.135 0-3.87 1.735-3.87 3.957 0 3.001 2.1 5.351 4.613 7.15.874.626 1.824 1.156 2.79 1.658Z" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="size-4"
    >
      <path d="M9.653 16.915a.75.75 0 0 0 .694 0c.966-.502 1.916-1.032 2.79-1.657 2.514-1.8 4.613-4.15 4.613-7.15 0-2.223-1.734-3.958-3.87-3.958-1.269 0-2.4.62-3.13 1.596-.73-.977-1.86-1.596-3.13-1.596-2.135 0-3.87 1.735-3.87 3.957 0 3.001 2.1 5.351 4.613 7.15.874.626 1.824 1.156 2.79 1.658Z" />
    </svg>
  )
}

// `title` and `interactive` exist for the listing-form preview, which renders a
// not-yet-saved apartment: it has no `apartmentTitle.<id>` translation and must
// not navigate or toggle a wishlist. Both default to today's behaviour, so
// every existing call site is unaffected.
function ApartmentCard({ apartment, title: titleOverride, interactive = true }) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const { isSaved, toggleWishlist } = useWishlist()
  const requireAuth = useRequireAuth()
  const isWishlisted = isSaved(apartment.id)

  const district = getDistrictById(apartment.districtId)
  const title = titleOverride ?? listingTitle(t, apartment)

  // Saving a listing belongs to an account, so a signed-out visitor is sent to
  // sign in first and returned here afterwards. The button stays visible either
  // way — hiding it would leave no way to discover the feature.
  const handleWishlistClick = requireAuth((event) => {
    event.stopPropagation()
    event.preventDefault()
    toggleWishlist(apartment.id)
  })

  // The guard runs after the default is prevented, so a signed-out click never
  // also follows the card's link.
  const onWishlistClick = (event) => {
    event.stopPropagation()
    event.preventDefault()
    handleWishlistClick(event)
  }

  const handleMapClick = (event) => {
    event.stopPropagation()
    event.preventDefault()
    navigate(`/map?apartment=${apartment.id}`)
  }

  const Wrapper = interactive ? 'a' : 'div'
  const wrapperProps = interactive
    ? {
        href: apartmentDetailsPath(apartment.id),
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': t('apartmentCard.detailsAriaLabel', { title }),
      }
    : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={`group flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        interactive ? 'cursor-pointer' : ''
      }`}
    >
      <div className="relative aspect-4/3 w-full overflow-hidden bg-surface-secondary">
        <img src={apartment.image} alt={title} loading="lazy" className="size-full object-cover" />
        {interactive ? (
        <button
          type="button"
          onClick={onWishlistClick}
          aria-pressed={isWishlisted}
          aria-label={
            isWishlisted ? t('apartmentCard.wishlistRemove') : t('apartmentCard.wishlistAdd')
          }
          className={`absolute right-3 top-3 flex size-8.5 items-center justify-center rounded-full shadow-[0_2px_10px_rgba(15,23,42,0.10)] ring-1 backdrop-blur-md transition-all duration-150 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            isWishlisted
              ? 'bg-primary-light/80 text-primary ring-primary/30'
              : 'bg-white/70 text-slate-600 ring-white/60 hover:bg-white/90'
          }`}
        >
          <HeartIcon filled={isWishlisted} />
        </button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="text-xl font-bold text-text-primary">
          {formatListingPrice(t, apartment)}
        </p>

        {/* Two lines are reserved whether or not the title needs them, so the
            rows below it line up across a row of cards. */}
        <h3 className="line-clamp-2 min-h-12 text-base font-medium text-text-primary">{title}</h3>

        <p className="flex items-center gap-1 text-sm text-text-secondary">
          <MapPin aria-hidden="true" size={14} className="shrink-0" />
          {district ? t(districtNameKey(district.id)) : ''}, {t('city.tashkent')}
        </p>

        <p className="text-sm text-text-muted">
          {t('apartmentCard.specs', {
            rooms: apartment.rooms,
            area: apartment.area,
            floor: apartment.floor,
            totalFloors: apartment.totalFloors,
          })}
        </p>

        {/* The narrowest card this grid produces is around 250px, and at that
            width the posted-at text and the map link together are close to the
            full inner width — closer still in Russian, where the label is
            "Смотреть на карте". `whitespace-nowrap` keeps the link on one line
            at any width in any language, and `flex-wrap` gives the row a way to
            resolve a genuine shortfall by moving the link down a line intact
            rather than breaking it in half or overflowing the card. */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-2.5 text-[13px]">
          <span className="text-text-muted">{formatPostedAt(apartment.postedAt, t)}</span>
          {interactive ? (
          <button
            type="button"
            onClick={handleMapClick}
            className="flex items-center gap-1 whitespace-nowrap font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Map aria-hidden="true" size={13} className="shrink-0" />
            {t('apartmentCard.mapView')}
          </button>
          ) : null}
        </div>
      </div>
    </Wrapper>
  )
}

export default ApartmentCard
