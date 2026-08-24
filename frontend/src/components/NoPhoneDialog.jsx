import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquare } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'

/**
 * Says why calling is not possible, and offers the thing that is.
 *
 * An owner who has not added a phone number cannot be rung, and a "Call" button
 * that opens an empty dialer — or does nothing at all — leaves the reader
 * guessing whether the app is broken. This states the reason in one sentence
 * and points at chat, which does work.
 *
 * Portalled, like the other dialogs: it opens from a page whose sticky and
 * scrolling ancestors would otherwise clip a fixed child.
 */
function NoPhoneDialog({ name, onClose, onOpenChat }) {
  const { t } = useLocale()

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="no-phone-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5"
      >
        <h2 id="no-phone-title" className="text-base font-semibold text-text-primary">
          {t('apartmentDetails.noPhoneTitle')}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          {t('apartmentDetails.noPhoneBody', { name })}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('chat.close')}
          </button>
          <button
            type="button"
            onClick={onOpenChat}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MessageSquare aria-hidden="true" size={15} />
            {t('apartmentDetails.goToChat')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default NoPhoneDialog
