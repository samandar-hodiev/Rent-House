import { Link } from 'react-router-dom'
import { useLocale } from '../../context/LocaleContext'
import { listingTitle } from '../../utils/listingText'
import { districtNameKey, getDistrictById } from '../../data/districts'
import { apartmentDetailsPath } from '../../routes/paths'
import { formatUzsAmount } from '../../utils/formatPrice'

// The listing a conversation is about, shown once at the top of the thread so
// both sides always know which apartment is being discussed.
function ChatApartmentPreview({ apartment }) {
  const { t } = useLocale()
  const title = listingTitle(t, apartment)
  const district = getDistrictById(apartment.districtId)

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
      <img
        src={apartment.image}
        alt={title}
        className="size-16 shrink-0 rounded-md object-cover"
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">
          {formatUzsAmount(apartment.price)} {t('currency.somPerMonth')}
        </p>
        <p className="truncate text-sm text-text-secondary">{title}</p>
        <p className="truncate text-xs text-text-muted">
          {district ? t(districtNameKey(district.id)) : ''}, {t('city.tashkent')}
        </p>
      </div>

      <Link
        to={apartmentDetailsPath(apartment.id)}
        className="shrink-0 rounded-md border border-border px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t('map.viewDetails')}
      </Link>
    </div>
  )
}

export default ChatApartmentPreview
