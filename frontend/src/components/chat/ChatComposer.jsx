import { useId, useState } from 'react'
import { Paperclip, Send } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'

// Pinned below the message area (the thread is a flex column and only the
// message list scrolls), so the composer stays reachable while scrolling.
function ChatComposer({ onSend }) {
  const { t } = useLocale()
  const inputId = useId()
  const [draft, setDraft] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex shrink-0 items-center gap-2 border-t border-border bg-surface p-3"
    >
      {/* Attachments are not implemented while there is no upload pipeline —
          the control is disabled rather than silently doing nothing. */}
      <button
        type="button"
        disabled
        aria-label={t('chat.attach')}
        title={t('chat.attachPending')}
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Paperclip aria-hidden="true" size={18} />
      </button>

      <label htmlFor={inputId} className="sr-only">
        {t('chat.placeholder')}
      </label>
      <input
        id={inputId}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t('chat.placeholder')}
        autoComplete="off"
        className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
      />

      <button
        type="submit"
        disabled={!draft.trim()}
        aria-label={t('chat.send')}
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
      >
        <Send aria-hidden="true" size={16} />
      </button>
    </form>
  )
}

export default ChatComposer
