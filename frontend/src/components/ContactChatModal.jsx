import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'
import { useChat } from '../context/ChatContext'
import ChatThread from './chat/ChatThread'

/**
 * The chat opened from an apartment's "Xabar yozish" button.
 *
 * It opens the real thread about this listing — the same one the dashboard
 * shows — rather than a separate scratch conversation. Asking for it is
 * idempotent: the backend keys a thread on (listing, enquirer), so reopening
 * the modal returns the existing conversation with its history.
 */
function ContactChatModal({ apartmentId, onClose }) {
  const { t } = useLocale()
  const { startConversation } = useChat()

  const [conversation, setConversation] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setFailed(false)

    startConversation(apartmentId)
      .then((opened) => {
        if (!cancelled) setConversation(opened)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [apartmentId, startConversation])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('apartmentDetails.message')}
        onClick={(event) => event.stopPropagation()}
        // Full height on a phone, a panel on a desktop. `min-h-0` on the thread
        // is what lets its message list scroll instead of the whole dialog.
        className="flex h-[88vh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-surface sm:h-[600px] sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-end px-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chat.cancel')}
            className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {failed ? (
          <p role="alert" className="p-6 text-center text-sm text-error">
            {t('chat.startFailed')}
          </p>
        ) : conversation ? (
          <ChatThread conversation={conversation} className="flex-1" />
        ) : (
          <p className="flex flex-1 items-center justify-center gap-2 text-sm text-text-muted">
            <Loader2 aria-hidden="true" size={16} className="animate-spin" />
            {t('chat.loading')}
          </p>
        )}
      </div>
    </div>
  )
}

export default ContactChatModal
