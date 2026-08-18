import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'
import { getDistrictById } from '../data/districts'
import { apartmentDetailsPath } from '../routes/paths'
import { formatUzsAmount } from '../utils/formatPrice'

function MapApartmentPreview({ apartment, onClose }) {
  const { t } = useLocale()
  const navigate = useNavigate()

  const title = t(`apartmentTitle.${apartment.id}`)
  const district = getDistrictById(apartment.districtId)

  return (
    <div className="pointer-events-auto flex gap-3 rounded-xl border border-border bg-surface p-3 shadow-md">
      <img
        src={apartment.image}
        alt={title}
        className="size-20 shrink-0 rounded-lg object-cover sm:size-24"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-bold text-text-primary">
            {formatUzsAmount(apartment.price)} {t('currency.somPerMonth')}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chat.close')}
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" size={14} />
          </button>
        </div>

        <p className="truncate text-sm font-medium text-text-primary">{title}</p>

        <p className="mt-0.5 text-xs text-text-muted">
          {t('apartmentCard.specs', {
            rooms: apartment.rooms,
            area: apartment.area,
            floor: apartment.floor,
            totalFloors: apartment.totalFloors,
          })}
        </p>
        <p className="text-xs text-text-muted">
          {district ? district.name : ''}, {t('city.tashkent')}
        </p>

        <button
          type="button"
          onClick={() => navigate(apartmentDetailsPath(apartment.id))}
          className="mt-2 self-start rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t('map.viewDetails')}
        </button>
      </div>
    </div>
  )
}

export default MapApartmentPreview
