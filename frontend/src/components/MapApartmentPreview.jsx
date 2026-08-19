import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'
import { getDistrictById, districtNameKey } from '../data/districts'
import { apartmentDetailsPath } from '../routes/paths'
import { formatUzsAmount } from '../utils/formatPrice'

const CONTAINER_CLASS = {
  floating: 'rounded-xl',
  sheet: 'rounded-t-2xl',
}

function MapApartmentPreview({ apartment, onClose, variant = 'floating' }) {
  const { t } = useLocale()
  const navigate = useNavigate()

  const title = t(`apartmentTitle.${apartment.id}`)
  const district = getDistrictById(apartment.districtId)

  return (
    <div
      className={`pointer-events-auto flex max-h-[80vh] flex-col overflow-hidden border border-border bg-surface shadow-lg ${CONTAINER_CLASS[variant]}`}
    >
      <div className="relative shrink-0">
        <img src={apartment.image} alt={title} className="h-40 w-full object-cover sm:h-48" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t('chat.close')}
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-sm hover:bg-white hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto p-4">
        <p className="text-lg font-bold text-text-primary">
          {formatUzsAmount(apartment.price)} {t('currency.somPerMonth')}
        </p>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-sm text-text-muted">
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

        <button
          type="button"
          onClick={() => navigate(apartmentDetailsPath(apartment.id))}
          className="mt-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('map.viewDetails')}
        </button>
      </div>
    </div>
  )
}

export default MapApartmentPreview
