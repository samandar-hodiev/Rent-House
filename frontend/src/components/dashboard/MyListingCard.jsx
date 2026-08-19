import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Heart, Pencil } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { districtNameKey, getDistrictById } from '../../data/districts'
import { LISTING_STATUS_CLASS } from '../../data/myListings'
import { apartmentDetailsPath, editListingPath } from '../../routes/paths'
import { formatUzsAmount } from '../../utils/formatPrice'
import { formatPostedAt } from '../../utils/formatRelativeTime'
import ListingGalleryModal from './ListingGalleryModal'

// One row in "Mening e'lonlarim": image left, details right on `sm:` and up,
// stacked below that.
function MyListingCard({ listing }) {
  const { t } = useLocale()
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  // An owner-edited title wins; otherwise the catalog title stays translated.
  const title = listing.customTitle ?? t(`apartmentTitle.${listing.id}`)
  const district = getDistrictById(listing.districtId)
  // This listing's own photos, falling back to the cover when it has just one.
  const galleryImages = listing.images?.length ? listing.images : [listing.image].filter(Boolean)

  return (
    // Fixed height from `sm:` up so every row matches regardless of the photo's
    // aspect ratio — a portrait image used to stretch its card taller than the
    // rest. Below `sm:` the stacked card already has a fixed 4:3 image.
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-shadow hover:shadow-md sm:h-56 sm:flex-row">
      {/* The image opens the photo viewer; "Ko'rish" still goes to the
          apartment page. On hover the overlay signals it is openable; on touch
          the tap does the same thing without needing hover. */}
      <button
        type="button"
        onClick={() => setIsGalleryOpen(true)}
        aria-label={t('listing.galleryOpen', { title })}
        className="group relative block aspect-4/3 w-full shrink-0 overflow-hidden bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:aspect-auto sm:h-full sm:w-48"
      >
        <img src={listing.image} alt={title} className="size-full object-cover" />

        <span className="absolute inset-0 flex items-center justify-center bg-slate-900/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Eye aria-hidden="true" size={22} className="text-white" />
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 truncate text-sm font-semibold text-text-primary">{title}</h2>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${LISTING_STATUS_CLASS[listing.status]}`}
            >
              {t(`listingStatus.${listing.status}`)}
            </span>
          </div>

          <p className="truncate text-sm text-text-secondary">
            {district ? t(districtNameKey(district.id)) : ''}, {t('city.tashkent')}
          </p>
          <p className="text-base font-semibold text-text-primary">
            {formatUzsAmount(listing.price)} {t('currency.somPerMonth')}
          </p>
          <p className="truncate text-sm text-text-muted">
            {t('apartmentCard.specs', {
              rooms: listing.rooms,
              area: listing.area,
              floor: listing.floor,
              totalFloors: listing.totalFloors,
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <Eye aria-hidden="true" size={14} />
            {t('dashboard.listingViews', { count: listing.views })}
          </span>
          <span className="flex items-center gap-1.5">
            <Heart aria-hidden="true" size={14} />
            {t('dashboard.listingSaves', { count: listing.saves })}
          </span>
          <span>{formatPostedAt(listing.createdAt, t)}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to={editListingPath(listing.id)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Pencil aria-hidden="true" size={14} />
            {t('dashboard.listingEdit')}
          </Link>

          <Link
            to={apartmentDetailsPath(listing.id)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Eye aria-hidden="true" size={14} />
            {t('dashboard.listingView')}
          </Link>
        </div>
      </div>

      {isGalleryOpen ? (
        <ListingGalleryModal
          images={galleryImages}
          title={title}
          onClose={() => setIsGalleryOpen(false)}
        />
      ) : null}
    </article>
  )
}

export default MyListingCard
