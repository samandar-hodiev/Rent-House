import { useEffect, useRef, useState } from 'react'
import { Check, CheckCheck, X } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { formatMessageTime } from '../../utils/formatChatTime'
import MessageAttachment from './MessageAttachment'
import MessageActionsMenu from './MessageActionsMenu'
import MessageQuote from './MessageQuote'

/**
 * One bubble.
 *
 * Outgoing messages sit right on the primary colour, incoming ones left on the
 * secondary surface, so the two are distinguishable by side and by fill rather
 * than by side alone.
 *
 * A withdrawn message keeps its place and loses its text: removing the row
 * would leave an unexplained gap where both people remember something being
 * said.
 */
function ChatMessage({
  message,
  isMine,
  onEdit,
  onDelete,
  onOpenImage,
  onReply,
  // Selection. `selecting` is the mode rather than a per-message flag: while it
  // is on, a click anywhere on a row toggles it instead of doing whatever that
  // part of the row usually does.
  selecting = false,
  selected = false,
  onToggleSelect,
  quoteAuthorName,
}) {
  const { t, locale } = useLocale()
  const isText = (message.kind ?? 'text') === 'text'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const startEditing = () => {
    setDraft(message.body)
    setEditing(true)
  }

  const submitEdit = async (event) => {
    event.preventDefault()
    const text = draft.trim()
    // Unchanged or emptied: nothing to save, so the editor simply closes.
    if (!text || text === message.body) {
      setEditing(false)
      return
    }
    if (await onEdit(message.id, text)) setEditing(false)
  }

  // While selecting, the whole row is the control. A click anywhere toggles the
  // message rather than reaching the edit, reply or attachment beneath it, so
  // there is no part of a row that does something unexpected mid-selection.
  const selectionProps = selecting
    ? {
        onClick: () => onToggleSelect(message.id),
        role: 'button',
        tabIndex: 0,
        'aria-pressed': selected,
        'aria-label': selected ? t('chat.deselectMessage') : t('chat.selectMessage'),
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggleSelect(message.id)
          }
        },
      }
    : {}

  // Warning rather than the primary green. Selecting is a staging step towards
  // deleting, so it should not wear the colour the app uses for its ordinary
  // affirmative actions. A tinted row plus a filled box reads clearly in both
  // themes without shouting, and leaves the bubbles' own colours untouched —
  // the tint is on the row behind them.
  const selectionClass = selecting
    ? `-mx-2 cursor-pointer rounded-md px-2 py-0.5 transition-colors ${
        selected ? 'bg-warning/15' : 'hover:bg-surface-secondary'
      }`
    : ''

  // A checkbox that reflects state rather than owning it — the row is what
  // handles the click, so this must not take one of its own.
  const checkbox = selecting ? (
    <span
      aria-hidden="true"
      className={`mt-2 flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
        // A dark tick on the amber fill. White on amber is barely legible,
        // and the chip is amber in both themes, so the tick is dark in both.
        selected ? 'border-warning bg-warning text-slate-900' : 'border-border bg-surface'
      }`}
    >
      {selected ? <Check size={11} strokeWidth={3} /> : null}
    </span>
  ) : null

  // Not while editing (the bubble is a form), not while selecting (the row
  // means one thing only), and not on a withdrawn message (there is nothing
  // left to act on).
  const showMenu = !editing && !selecting && !message.isDeleted

  if (message.isDeleted) {
    return (
      <li
        {...selectionProps}
        className={`flex items-start gap-2 ${selectionClass} ${
          isMine ? 'justify-end' : 'justify-start'
        }`}
      >
        {!isMine ? checkbox : null}
        <div className="max-w-[80%] rounded-lg border border-dashed border-border px-3 py-2 sm:max-w-[70%]">
          <p className="text-sm italic text-text-muted">{t('chat.messageDeleted')}</p>
        </div>
        {isMine ? checkbox : null}
      </li>
    )
  }

  return (
    <li
      {...selectionProps}
      className={`group flex items-start gap-2 ${selectionClass} ${
        isMine ? 'justify-end' : 'justify-start'
      }`}
    >
      {!isMine ? checkbox : null}
      {/* Holds the bubble's width limit. The actions used to be a second
          column here, which is why it was a row. */}
      <div className="flex max-w-[85%] flex-col sm:max-w-[75%]">
        <div
          className={`relative min-w-0 rounded-lg py-2 pl-3 ${
            // A gutter for the actions button, reserved rather than overlaid,
            // so nothing shifts when it fades in and no text runs under it.
            showMenu ? 'pr-9' : 'pr-3'
          } ${isMine ? 'bg-primary text-white' : 'border border-border bg-surface-secondary'} ${
            // While selecting, the row is the only thing that responds. Without
            // this, clicking an image inside a bubble would open the lightbox
            // *and* toggle the message underneath it.
            selecting ? 'pointer-events-none select-none' : ''
          }`}
        >
          {/* One button in the bubble's top corner, in place of the four that
              used to sit beside every row. */}
          {showMenu ? (
            <MessageActionsMenu
              isMine={isMine}
              isText={isText}
              onSurface={isMine}
              onReply={() => onReply(message)}
              onSelect={() => onToggleSelect(message.id)}
              onEdit={startEditing}
              onDelete={() => onDelete(message)}
            />
          ) : null}
          {editing ? (
            <form onSubmit={submitEdit} className="flex flex-col gap-2">
              <input
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setEditing(false)
                }}
                aria-label={t('chat.edit')}
                className="w-full rounded-md border border-white/30 bg-white/10 px-2 py-1 text-sm text-white placeholder:text-white/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              />
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  aria-label={t('chat.cancel')}
                  className="flex size-6 items-center justify-center rounded text-white/80 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <X aria-hidden="true" size={13} />
                </button>
                <button
                  type="submit"
                  aria-label={t('chat.save')}
                  className="flex size-6 items-center justify-center rounded text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <Check aria-hidden="true" size={13} />
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* The message being answered, above this one's own words. */}
              {message.replyTo ? (
                <MessageQuote
                  quote={message.replyTo}
                  authorName={quoteAuthorName}
                  onSurface={isMine}
                  className="mb-1.5"
                />
              ) : null}

              {message.attachment ? (
                <div className={message.body ? 'mb-2' : undefined}>
                  <MessageAttachment
                    attachment={message.attachment}
                    isMine={isMine}
                    onOpenImage={onOpenImage}
                  />
                </div>
              ) : null}

              {message.body ? (
                <p
                  className={`whitespace-pre-wrap break-words text-sm ${
                    isMine ? '' : 'text-text-primary'
                  }`}
                >
                  {message.body}
                </p>
              ) : null}

              <p
                className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
                  isMine ? 'text-white/70' : 'text-text-muted'
                }`}
              >
                {message.isEdited ? <span>{t('chat.edited')}</span> : null}
                <span>{formatMessageTime(message.createdAt, locale)}</span>
                {/* Ticks belong to the sender: they report whether the other
                    side has read it, which is meaningless on your own copy of
                    someone else's message. */}
                {isMine ? (
                  message.isRead ? (
                    <CheckCheck aria-label={t('chat.read')} size={14} className="shrink-0" />
                  ) : (
                    <Check aria-label={t('chat.sent')} size={14} className="shrink-0" />
                  )
                ) : null}
              </p>
            </>
          )}
        </div>
      </div>
      {isMine ? checkbox : null}
    </li>
  )
}

export default ChatMessage
