import { useEffect, useState } from 'react'
import { X, Send } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'

function ContactChatModal({ ownerName, onClose }) {
  const { t } = useLocale()
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSend = (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    setMessages((current) => [...current, { id: current.length, text }])
    setDraft('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('chat.headerWithName', { name: ownerName })}
        onClick={(event) => event.stopPropagation()}
        className="flex h-[70vh] w-full max-w-sm flex-col rounded-t-xl bg-surface shadow-md sm:h-[32rem] sm:rounded-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-text-primary">
            {t('chat.headerWithName', { name: ownerName })}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('chat.close')}
            className="flex size-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <p className="pt-8 text-center text-sm text-text-muted">{t('chat.empty')}</p>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2">
                <p className="text-sm text-white">{message.text}</p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border p-3">
          <label htmlFor="chat-message-input" className="sr-only">
            {t('chat.placeholder')}
          </label>
          <input
            id="chat-message-input"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('chat.placeholder')}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="submit"
            aria-label={t('chat.send')}
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Send aria-hidden="true" size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}

export default ContactChatModal
