import { Link } from 'react-router-dom'
import { Eye, Heart, Pencil } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { districtNameKey, getDistrictById } from '../../data/districts'
import { LISTING_STATUS } from '../../data/myListings'
import { apartmentDetailsPath, editListingPath } from '../../routes/paths'
import { formatUzsAmount } from '../../utils/formatPrice'
import { formatPostedAt } from '../../utils/formatRelativeTime'

// Status tints stay inside the existing token palette: primary for live,
// warning for awaiting review, muted for closed.
const STATUS_CLASS = {
  [LISTING_STATUS.approved]: 'bg-primary-light text-primary-hover',
  [LISTING_STATUS.pending]: 'bg-warning/15 text-warning',
  [LISTING_STATUS.closed]: 'bg-surface-secondary text-text-muted',
}

// One row in "Mening e'lonlarim": image left, details right on `sm:` and up,
// stacked below that.
function MyListingCard({ listing }) {
  const { t } = useLocale()
  // An owner-edited title wins; otherwise the catalog title stays translated.
  const title = listing.customTitle ?? t(`apartmentTitle.${listing.id}`)
  const district = getDistrictById(listing.districtId)

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-shadow hover:shadow-md sm:flex-row">
      <div className="aspect-4/3 w-full shrink-0 overflow-hidden bg-surface-secondary sm:aspect-auto sm:h-auto sm:w-48">
        <img src={listing.image} alt={title} className="size-full object-cover" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 truncate text-sm font-semibold text-text-primary">{title}</h2>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[listing.status]}`}
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
    </article>
  )
}

export default MyListingCard
