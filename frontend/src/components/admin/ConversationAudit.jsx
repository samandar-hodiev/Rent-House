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
      <span className="flex max-w-[78%] flex-col gap-0.5">
        <span
          className={`rounded-lg px-3 py-2 text-sm ${
            mine
              ? 'border border-border bg-surface-secondary text-text-primary'
              : 'bg-primary text-white'
          } ${deleted ? 'opacity-70' : ''}`}
        >
          {message.body || <span className="italic opacity-70">{t('audit.noText')}</span>}
          <span
            className={`mt-1 block text-[10px] ${mine ? 'text-text-muted' : 'text-white/70'}`}
          >
            {clock(message.createdAt)}
            {message.editedAt ? ` · ${t('audit.edited')}` : ''}
          </span>
        </span>

        {/* Where an "edited" note would go, and the same size. */}
        {deleted ? (
          <span className={`text-[10px] text-error ${mine ? 'text-left' : 'text-right'}`}>
            {t('audit.deletedBy', { name: message.deletedByName ?? t('audit.unknownDeleter') })}
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
      <div className="flex items-center justify-center p-8">
        <Loader2 aria-hidden="true" size={18} className="animate-spin text-text-muted" />
      </div>
    )
  }
  if (state === 'error') {
    return <p className="p-4 text-sm text-error">{t('audit.loadFailed')}</p>
  }
  if (conversations.length === 0) {
    return <p className="p-4 text-sm text-text-muted">{t('listings.noChats')}</p>
  }

  const chat = conversations[index]
  const first = index === 0
  const last = index === conversations.length - 1
  const nav =
    'flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45'

  return (
    <div className="flex flex-col">
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
            className="flex size-7 items-center justify-center rounded-md border border-border text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ChevronLeft aria-hidden="true" size={15} />
          </button>
          <span className="px-1 text-[11px] tabular-nums text-text-muted">
            {index + 1} / {conversations.length}
          </span>
          <button
            type="button"
            onClick={() => setIndex((i) => i + 1)}
            disabled={last}
            aria-label={t('audit.nextChat')}
            className="flex size-7 items-center justify-center rounded-md border border-border text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ChevronRight aria-hidden="true" size={15} />
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

      <ul
        ref={bodyRef}
        className="chat-scroll flex max-h-96 flex-col gap-2 overflow-y-auto bg-background/40 p-4"
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
