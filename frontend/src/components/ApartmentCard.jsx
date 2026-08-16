import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocale } from '../context/LocaleContext'
import { getDistrictById } from '../data/districts'
import { apartmentDetailsPath } from '../routes/paths'
import { formatUzsAmount } from '../utils/formatPrice'
import { formatPostedAt } from '../utils/formatRelativeTime'

function HeartIcon({ filled }) {
  if (filled) {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-5">
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
      className="size-5"
    >
      <path d="M9.653 16.915a.75.75 0 0 0 .694 0c.966-.502 1.916-1.032 2.79-1.657 2.514-1.8 4.613-4.15 4.613-7.15 0-2.223-1.734-3.958-3.87-3.958-1.269 0-2.4.62-3.13 1.596-.73-.977-1.86-1.596-3.13-1.596-2.135 0-3.87 1.735-3.87 3.957 0 3.001 2.1 5.351 4.613 7.15.874.626 1.824 1.156 2.79 1.658Z" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-3.5 shrink-0">
      <path
        fillRule="evenodd"
        d="M9.69 18.933.984 10.31a6.75 6.75 0 1 1 9.548-9.547L20.28 10.02a.75.75 0 0 1 0 1.06l-8.85 8.85a.75.75 0 0 1-1.06 0l-.68-.997ZM10 8.75a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ApartmentCard({ apartment }) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const [isWishlisted, setIsWishlisted] = useState(false)

  const district = getDistrictById(apartment.districtId)

  const handleCardClick = () => {
    navigate(apartmentDetailsPath(apartment.id))
  }

  const handleKeyDown = (event) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleCardClick()
    }
  }

  const handleWishlistClick = (event) => {
    event.stopPropagation()
    setIsWishlisted((current) => !current)
  }

  const handleMapClick = (event) => {
    event.stopPropagation()
    navigate(`/map?apartment=${apartment.id}`)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      aria-label={t('apartmentCard.detailsAriaLabel', { title: apartment.title })}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative aspect-[6/5] w-full overflow-hidden bg-surface-secondary">
        <img
          src={apartment.image}
          alt={apartment.title}
          loading="lazy"
          className="size-full object-cover"
        />
        <button
          type="button"
          onClick={handleWishlistClick}
          aria-pressed={isWishlisted}
          aria-label={
            isWishlisted ? t('apartmentCard.wishlistRemove') : t('apartmentCard.wishlistAdd')
          }
          className={`absolute right-3 top-3 flex size-10 items-center justify-center rounded-full shadow-[0_2px_10px_rgba(15,23,42,0.10)] ring-1 backdrop-blur-md transition-all duration-150 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            isWishlisted
              ? 'bg-primary-light/80 text-primary ring-primary/30'
              : 'bg-white/70 text-text-secondary ring-white/60 hover:bg-white/90'
          }`}
        >
          <HeartIcon filled={isWishlisted} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="text-xl font-semibold text-text-primary">
          {formatUzsAmount(apartment.price)} {t('currency.somPerMonth')}
        </p>

        <h3 className="truncate text-base font-medium text-text-primary">{apartment.title}</h3>

        <p className="flex items-center gap-1 text-sm text-text-secondary">
          <PinIcon />
          {district ? district.name : ''}, {t('city.tashkent')}
        </p>

        <p className="text-sm text-text-muted">
          {t('apartmentCard.specs', {
            rooms: apartment.rooms,
            area: apartment.area,
            floor: apartment.floor,
            totalFloors: apartment.totalFloors,
          })}
        </p>

        <div className="mt-auto flex items-center justify-between pt-3 text-sm">
          <span className="text-text-muted">{formatPostedAt(apartment.postedAt, t)}</span>
          <button
            type="button"
            onClick={handleMapClick}
            className="flex items-center gap-1 font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <PinIcon />
            {t('apartmentCard.mapView')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ApartmentCard
