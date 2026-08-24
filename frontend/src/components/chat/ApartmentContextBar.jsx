import { Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLocale } from '../../context/LocaleContext'
import { apartmentDetailsPath } from '../../routes/paths'
import { formatListingPrice } from '../../utils/formatPrice'
import { toReadableCase } from '../../utils/readableText'

/**
 * The listing a run of messages is about.
 *
 * A conversation belongs to two people, not to a listing, so this is context
 * rather than identity. It is rendered inside the message flow, immediately
 * before the first message about a given listing, which is what lets one thread
 * cover several listings and still be readable: each run announces what it is
 * about, and scrolling back shows where one listing's discussion ended and the
 * next began.
 *
 * Deliberately not in the thread header. A header can only ever name one
 * listing — whichever is pinned — so anything written about an earlier one
 * would be captioned wrongly.
 */
function ApartmentContextBar({ apartment }) {
  const { t } = useLocale()
  if (!apartment?.id) return null

  return (
    <div className="my-1 flex items-center gap-3 rounded-lg border border-border bg-surface-secondary px-3 py-2">
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
          {toReadableCase(apartment.title)}
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
