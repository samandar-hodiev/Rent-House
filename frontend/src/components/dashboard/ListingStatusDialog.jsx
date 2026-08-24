import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { LISTING_STATUS } from '../../data/listingStatus'

// Moving a listing out of public view is the consequential direction, so those
// confirmations wear the restrictive style. Publishing one is not, and asking
// for it in red would make the ordinary step look like a warning.
const RESTRICTIVE = new Set([LISTING_STATUS.closed, LISTING_STATUS.deleted])

/**
 * Confirms a change to a listing's state.
 *
 * Every transition is asked about, because each one changes who can see the
 * listing — closing takes it off the market, deleting takes it out of the
 * owner's own lists, publishing puts it in front of everyone. None of them is
 * something to discover after a slipped click.
 *
 * Portalled, like the other dialogs here: the listings page is a scrolling
 * column inside a pinned section, which would clip a fixed child.
 */
function ListingStatusDialog({ target, busy, error, onCancel, onConfirm }) {
  const { t } = useLocale()
  const restrictive = RESTRICTIVE.has(target)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, busy])

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={() => (busy ? undefined : onCancel())}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-status-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5"
      >
        <h2 id="listing-status-title" className="text-base font-semibold text-text-primary">
          {t(`listingAction.${target}.title`)}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">{t(`listingAction.${target}.body`)}</p>

        {error ? (
          <p role="alert" className="mt-3 text-xs text-error">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            {t('chat.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 ${
              restrictive
                ? 'border border-error/40 bg-error/10 text-error hover:bg-error/15'
                : 'bg-primary text-white hover:bg-primary-hover'
            }`}
          >
            {busy ? <Loader2 aria-hidden="true" size={15} className="animate-spin" /> : null}
            {t(`listingAction.${target}.confirm`)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default ListingStatusDialog
