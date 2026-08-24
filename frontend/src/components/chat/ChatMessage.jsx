import { useEffect, useRef, useState } from 'react'
import { Check, CheckCheck, CheckSquare, CornerUpLeft, Pencil, Trash2, X } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { formatMessageTime } from '../../utils/formatChatTime'
import MessageAttachment from './MessageAttachment'
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

  const selectionClass = selecting
    ? `-mx-2 cursor-pointer rounded-md px-2 py-0.5 transition-colors ${
        selected ? 'bg-primary/10' : 'hover:bg-surface-secondary'
      }`
    : ''

  // A checkbox that reflects state rather than owning it — the row is what
  // handles the click, so this must not take one of its own.
  const checkbox = selecting ? (
    <span
      aria-hidden="true"
      className={`mt-2 flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
        selected ? 'border-primary bg-primary text-white' : 'border-border bg-surface'
      }`}
    >
      {selected ? <Check size={11} strokeWidth={3} /> : null}
    </span>
  ) : null

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
      <div className={`flex max-w-[85%] items-end gap-1 sm:max-w-[75%] ${isMine ? 'flex-row' : 'flex-row-reverse'}`}>
        {/* Actions sit outside the bubble and appear on hover, or always on a
            touch screen where there is no hover to reveal them. Hidden while
            selecting, where the row means one thing only. */}
        {!editing && !selecting ? (
          <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-100">
            {/* Reply is offered on every message, incoming and outgoing alike:
                answering your own message to add to it is as ordinary as
                answering someone else's. */}
            <button
              type="button"
              onClick={() => onReply(message)}
              aria-label={t('chat.reply')}
              title={t('chat.reply')}
              className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <CornerUpLeft aria-hidden="true" size={13} />
            </button>

            {/* The way into selection mode. Selecting the first message turns
                it on; from then on the rows themselves are the control, so
                this is the only place it has to be offered. */}
            <button
              type="button"
              onClick={() => onToggleSelect(message.id)}
              aria-label={t('chat.selectMessages')}
              title={t('chat.selectMessages')}
              className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <CheckSquare aria-hidden="true" size={13} />
            </button>

            {/* Editing and deleting stay the author's own, as they were. */}
            {isMine && isText ? (
            <button
              type="button"
              onClick={startEditing}
              aria-label={t('chat.edit')}
              title={t('chat.edit')}
              className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Pencil aria-hidden="true" size={13} />
            </button>
            ) : null}
            {isMine ? (
            <button
              type="button"
              onClick={() => onDelete(message)}
              aria-label={t('chat.delete')}
              title={t('chat.delete')}
              className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Trash2 aria-hidden="true" size={13} />
            </button>
            ) : null}
          </div>
        ) : null}

        <div
          className={`min-w-0 rounded-lg px-3 py-2 ${
            isMine ? 'bg-primary text-white' : 'border border-border bg-surface-secondary'
          }`}
        >
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
