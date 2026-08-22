import { Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLocale } from '../../context/LocaleContext'
import { apartmentDetailsPath } from '../../routes/paths'
import { formatListingPrice } from '../../utils/formatPrice'

/**
 * The listing a conversation is currently about.
 *
 * A conversation belongs to two people, not to a listing, so this is context
 * rather than identity — it says what is being discussed now, and changes when
 * the pair start talking about something else. Nothing is lost when it does:
 * the older listings stay on the messages that named them.
 *
 * Compact on purpose. It sits above every message in the thread, so it earns
 * one line and a way out of it, not a card.
 */
function ApartmentContextBar({ apartment }) {
  const { t } = useLocale()
  if (!apartment?.id) return null

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface-secondary px-4 py-2">
      {apartment.image ? (
        <img
          src={apartment.image}
          alt=""
          className="size-9 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface">
          <Home aria-hidden="true" size={16} className="text-text-muted" />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-text-primary">
          {apartment.title}
        </span>
        <span className="block truncate text-[11px] text-text-muted">
          {[apartment.district, apartment.price ? formatListingPrice(t, apartment) : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>

      <Link
        to={apartmentDetailsPath(apartment.id)}
        className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {t('chat.viewApartment')}
      </Link>
    </div>
  )
}

export default ApartmentContextBar
