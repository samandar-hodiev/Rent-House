import { useMemo } from 'react'
import ApartmentCard from '../ApartmentCard'
import { useLocale } from '../../context/LocaleContext'

// Maps the form state onto the shape `ApartmentCard` already consumes, so the
// preview is the real card component rather than a second card design.
function ListingPreview({ listing }) {
  const { t } = useLocale()

  const cover =
    listing.images.find((image) => image.id === listing.coverImageId) ?? listing.images[0] ?? null

  const apartment = useMemo(
    () => ({
      id: 'preview',
      price: Number(listing.price) || 0,
      // Carried through so the preview prices the listing the way the public
      // card will. Without these the card fell back to so'm and a dollar
      // listing previewed as "300 so'm / oy".
      currency: listing.currency,
      rentalPeriod: listing.rentalPeriod,
      districtId: listing.location.district,
      rooms: Number(listing.rooms) || 0,
      area: Number(listing.area) || 0,
      floor: Number(listing.floor) || 0,
      totalFloors: Number(listing.totalFloors) || 0,
      image: cover?.url ?? '',
      postedAt: new Date().toISOString(),
    }),
    [listing, cover],
  )

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-text-primary">{t('listing.previewTitle')}</h2>
      <p className="text-xs text-text-muted">{t('listing.previewHint')}</p>

      {cover ? (
        <ApartmentCard
          apartment={apartment}
          title={listing.title || t('listing.previewPlaceholderTitle')}
          interactive={false}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-text-muted">
          {t('listing.previewEmpty')}
        </div>
      )}
    </div>
  )
}

export default ListingPreview
