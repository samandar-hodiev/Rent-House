import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useListings } from '../../context/ListingsContext'
import { useLocale } from '../../context/LocaleContext'
import { useSiteLocation } from '../../hooks/useSiteLocation'
import { useToast } from '../../context/ToastContext'
import { districtNameKey, getDistrictById } from '../../data/districts'
import { LISTING_STATUS, LISTING_STATUS_CLASS } from '../../data/listingStatus'
import ListingStatusMenu from './ListingStatusMenu'
import ListingStatusDialog from './ListingStatusDialog'
import { apartmentDetailsPath, editListingPath, listingsPathFor } from '../../routes/paths'
import { formatListingPrice } from '../../utils/formatPrice'
import { formatPostedAt } from '../../utils/formatRelativeTime'
import { listingTitle } from '../../utils/listingText'
import ListingGalleryModal from './ListingGalleryModal'

// One row in "Mening e'lonlarim": image left, details right on `sm:` and up,
// stacked below that.
//
// `compact` drops the delete button, for the dashboard's three-listing preview.
// Deleting is management, and management belongs on the page that manages —
// the summary offers viewing and editing and sends you there for the rest.
function MyListingCard({ listing, compact = false }) {
  const { t } = useLocale()
  const { city } = useSiteLocation()
  const navigate = useNavigate()
  const { removeListing, changeListingStatus } = useListings()
  const { showToast } = useToast()

  // The state being confirmed, if any. One piece of state for both the menu's
  // transitions and the delete button, because they are the same action with
  // different targets — and having two would let two dialogs open at once.
  const [pendingTarget, setPendingTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const confirmStatusChange = async () => {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      if (pendingTarget === LISTING_STATUS.deleted) {
        await removeListing(listing.id)
      } else {
        await changeListingStatus(listing.id, pendingTarget)
      }
      showToast(t(`listingAction.${pendingTarget}.done`))
      setPendingTarget(null)
      // Sent to the state the listing has just moved into, which is where it
      // now lives — leaving the reader on a page the card has just left would
      // look like the action did nothing.
      navigate(listingsPathFor(pendingTarget))
    } catch {
      setActionError(t('listing.errorDeleteFailed'))
    } finally {
      setBusy(false)
    }
  }
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)
  // An owner-edited title wins; otherwise the catalog title stays translated.
  const title = listingTitle(listing)
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
            <span className="flex shrink-0 items-center gap-1">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${LISTING_STATUS_CLASS[listing.status]}`}
              >
                {t(`listingStatus.${listing.status}`)}
              </span>
              {/* Beside the badge, because what it offers is a change to
                  exactly that. Absent from the dashboard's preview, where
                  management is not the job. */}
              {compact ? null : (
                <ListingStatusMenu
                  status={listing.status}
                  disabled={busy}
                  onSelect={(target) => {
                    setActionError(null)
                    setPendingTarget(target)
                  }}
                />
              )}
            </span>
          </div>

          <p className="truncate text-sm text-text-secondary">
            {district ? t(districtNameKey(district.id)) : ''}, {city}
          </p>
          <p className="text-base font-semibold text-text-primary">
            {formatListingPrice(t, listing)}
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
            {t('dashboard.listingViews', { count: listing.viewsCount ?? 0 })}
          </span>
          {/* The saves count is deliberately absent: favourites are stored, but
              nothing counts them per listing yet, and a number invented here
              would be worse than no number. It returns with that endpoint. */}
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

          {/* Destructive and irreversible, so it asks first and stays disabled
              while the request runs — a second click must not fire a second
              delete. Styled as the lightest action on the row, not a red
              button competing with Edit. */}
          {compact ? null : (
            <button
              type="button"
              onClick={() => {
                setActionError(null)
                setDeleteError(null)
                setPendingTarget(LISTING_STATUS.deleted)
              }}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-error/40 hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 aria-hidden="true" size={14} />
              {t('listing.delete')}
            </button>
          )}
        </div>

        {pendingTarget ? (
          <ListingStatusDialog
            target={pendingTarget}
            busy={busy}
            error={actionError}
            onCancel={() => (busy ? undefined : setPendingTarget(null))}
            onConfirm={confirmStatusChange}
          />
        ) : null}

        {deleteError ? (
          <p role="alert" className="text-xs text-error">
            {deleteError}
          </p>
        ) : null}
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
