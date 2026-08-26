import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, ShieldAlert } from 'lucide-react'
import UserAvatar from '../dashboard/UserAvatar'
import { useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { fetchListingAudit } from '../../services/adminApi'

const pad = (value) => String(value).padStart(2, '0')
const clock = (iso) => {
  const at = new Date(iso)
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/**
 * One message, on the side of whoever sent it.
 *
 * A withdrawn message is shown in full rather than as the placeholder its two
 * participants see — that is what this view is for. It is marked instead: the
 * bubble is muted and a line underneath, in the same place an edit is noted,
 * says who withdrew it. Small and red, so it reads as a note about the message
 * rather than as part of it.
 */
function AuditMessage({ message, mine, t }) {
  const deleted = Boolean(message.deletedAt)

  return (
    <li className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
      <span
        className={`max-w-[78%] rounded-lg px-3 py-2 text-sm ${
          mine
            ? 'border border-border bg-surface-secondary text-text-primary'
            : 'bg-primary text-white'
        }`}
      >
        {message.body || <span className="italic opacity-70">{t('audit.noText')}</span>}

        <span className={`mt-1 block text-[10px] ${mine ? 'text-text-muted' : 'text-white/70'}`}>
          {clock(message.createdAt)}
          {message.editedAt ? ` · ${t('audit.edited')}` : ''}
        </span>

        {/* Inside the bubble and last, so a withdrawn message reads as one
            thing rather than as a message with a caption floating under it.
            On the green side the plain error red would disappear, so the note
            keeps its own light tint there. */}
        {deleted ? (
          <span
            className={`mt-1 block border-t pt-1 text-[10px] ${
              mine ? 'border-error/25 text-error' : 'border-white/25 text-red-100'
            }`}
          >
            {message.deletedByName
              ? t('audit.deletedBy', { name: message.deletedByName })
              : t('audit.deletedUnknown')}
          </span>
        ) : null}
      </span>
    </li>
  )
}

/**
 * Every conversation held about a listing owner's listings, one at a time.
 *
 * Read-only by construction: there is no composer anywhere in it, so an
 * administrator cannot write in somebody else's name even by accident.
 *
 * Reached from a listing but scoped to its owner — somebody looking into a
 * person's conduct wants every thread about everything they published, not the
 * one that happens to mention this flat.
 */
function ConversationAudit({ listingId, ownerName, ownerId }) {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const [conversations, setConversations] = useState([])
  const [state, setState] = useState('loading')
  const [index, setIndex] = useState(0)
  const bodyRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    fetchListingAudit(listingId, { token, signal: controller.signal })
      .then((rows) => {
        if (cancelled) return
        setConversations(rows)
        setIndex(0)
        setState('ready')
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return
        setState('error')
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [listingId, token])

  // Each thread opens at its most recent message, which is where a reader
  // wants to start.
  useEffect(() => {
    const box = bodyRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [index, state])

  if (state === 'loading') {
    return (
      <div className="flex min-h-[16rem] flex-1 items-center justify-center">
        <Loader2 aria-hidden="true" size={18} className="animate-spin text-text-muted" />
      </div>
    )
  }
  if (state === 'error') {
    return (
      <p className="flex min-h-[16rem] flex-1 items-center justify-center text-sm text-error">
        {t('audit.loadFailed')}
      </p>
    )
  }
  if (conversations.length === 0) {
    return (
      <p className="flex min-h-[16rem] flex-1 items-center justify-center text-sm text-text-muted">
        {t('listings.noChats')}
      </p>
    )
  }

  const chat = conversations[index]
  const first = index === 0
  const last = index === conversations.length - 1
  const nav =
    'flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45'
  // One declaration for both arrows, so they cannot end up different sizes.
  const circle =
    'flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Owner on the left, the person who wrote on the right, and the way
          between threads in the middle — the same arrangement as the messages
          below it, so the sides mean the same thing throughout. */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <UserAvatar name={ownerName} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-text-primary">
              {ownerName}
            </span>
            <span className="block text-[11px] text-text-muted">{t('audit.listingOwner')}</span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            disabled={first}
            aria-label={t('audit.previousChat')}
            className={circle}
          >
            <ChevronLeft aria-hidden="true" size={16} />
          </button>
          <span className="px-1 text-[11px] tabular-nums text-text-muted">
            {index + 1} / {conversations.length}
          </span>
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            disabled={last}
            aria-label={t('audit.nextChat')}
            className={circle}
          >
            <ChevronRight aria-hidden="true" size={16} />
          </button>
        </span>

        <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-text-primary">
              {chat.userName}
            </span>
            <span className="block text-[11px] text-text-muted">{t('audit.contactedThem')}</span>
          </span>
          <UserAvatar name={chat.userName} src={chat.userAvatar} />
        </span>
      </header>

      {/* Capped against the viewport rather than left to `flex-1`: the admin
          shell's main column is as tall as its content, so a flexible child
          has nothing to be a fraction of and simply grows — a hundred and fifty
          messages made the card ten thousand pixels tall. A viewport-relative
          ceiling gives the card the rest of the screen and no more, which is
          what makes the thread scroll inside it and the footer stay put. */}
      <ul
        ref={bodyRef}
        className="chat-scroll flex max-h-[calc(100vh-26rem)] min-h-[18rem] flex-1 flex-col gap-2 overflow-y-auto bg-background/40 p-4"
      >
        {chat.messages.map((message) => (
          <AuditMessage
            key={message.id}
            message={message}
            // The owner's own words on the left, everybody else's on the right.
            mine={message.senderId === ownerId}
            t={t}
          />
        ))}
      </ul>

      <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
        <button type="button" onClick={() => setIndex((i) => i - 1)} disabled={first} className={nav}>
          <ChevronLeft aria-hidden="true" size={14} />
          {t('audit.previousChat')}
        </button>

        <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <ShieldAlert aria-hidden="true" size={12} className="shrink-0" />
          {t('chats.readOnly')}
        </span>

        <button type="button" onClick={() => setIndex((i) => i + 1)} disabled={last} className={nav}>
          {t('audit.nextChat')}
          <ChevronRight aria-hidden="true" size={14} />
        </button>
      </footer>
    </div>
  )
}

export default ConversationAudit
