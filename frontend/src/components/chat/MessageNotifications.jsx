import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import { useLocale } from '../../context/LocaleContext'
import { useSiteSettings } from '../../context/SiteSettingsContext'
import { CHAT_EVENTS } from '../../services/chatSocket'
import { useMessageSound } from '../../hooks/useMessageSound'
import { ROUTES } from '../../routes/paths'
import UserAvatar from '../dashboard/UserAvatar'

// How long a toast stays before it withdraws itself. Long enough to read a
// name and a line of text, short enough not to sit over the page.
const DISMISS_MS = 6000
// More than a few stacked toasts is a wall, not a notification.
const MAX_VISIBLE = 3

// Asked once per browser, and only after the reader has opened chat at least
// once — so the permission prompt arrives attached to something they were
// already doing rather than on first load.
const PERMISSION_ASKED_KEY = 'renthouse_notify_asked'

/**
 * Tells the reader a message arrived.
 *
 * Two channels for two situations. With the tab in front, an in-app card: it
 * needs no permission, cannot be silently blocked, and matches the rest of the
 * interface. With the tab in the background, where an in-app card would go
 * unseen, the browser's own notification — but only if the reader has allowed
 * it, and never as a second copy of one already shown in-app.
 *
 * Mounted once, above the router, so a message arriving while the reader is on
 * the map or editing a listing still reaches them.
 */
function MessageNotifications() {
  const { t } = useLocale()
  // Whether an arriving message raises a card at all. A notification is a
  // choice the marketplace makes on its readers' behalf, so it is switchable —
  // and switching it off has to stop the card rather than merely hide the
  // setting.
  const { settings } = useSiteSettings()
  const navigate = useNavigate()
  const { subscribe, conversations, activeConversationRef, isAuthenticated } = useChat()
  const { user } = useAuth()
  const [toasts, setToasts] = useState([])

  // The audible half of "a message arrived". Kept separate from the cards
  // below because the two answer different questions: a card is suppressed
  // when the reader is already looking at the thread, a sound is not.
  useMessageSound()

  // Read inside the socket handler, which is created once — refs keep them
  // current without resubscribing on every render.
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const myIdRef = useRef(user?.id)
  myIdRef.current = user?.id

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const open = useCallback(
    (conversationId) => {
      dismiss(conversationId)
      navigate(`${ROUTES.dashboardChats}?c=${conversationId}`)
    },
    [dismiss, navigate],
  )

  // Read inside the subscription, which is created once, so switching the
  // setting off takes effect on the next message rather than on the next
  // sign-in.
  const notifyRef = useRef(settings.notify_new_message)
  notifyRef.current = settings.notify_new_message

  useEffect(() => {
    if (!isAuthenticated) return undefined

    const unsubscribe = subscribe((envelope) => {
      // Switched off for the marketplace: no card, no browser notification.
      // The message itself still arrives and the thread still updates — this
      // governs the announcement, not the delivery.
      if (!notifyRef.current) return

      const { event, conversation_id: conversationId, payload } = envelope
      if (event !== CHAT_EVENTS.messageNew) return

      // The sender's own echo, sent so their other tabs stay in step, is not
      // news to them.
      if (payload?.sender_id === myIdRef.current) return

      // Already on screen: the reader can see the message arrive, and a card
      // announcing what they are looking at is noise.
      if (activeConversationRef.current === conversationId && !document.hidden) return

      const conversation = conversationsRef.current.find((item) => item.id === conversationId)

      // Blocked either way: the server does not publish these, and this is the
      // second lock — a frame that arrived before the block was applied must
      // not announce itself afterwards.
      if (conversation?.isBlocked || conversation?.isBlockedBy) return

      const from = conversation?.other?.name ?? t('chat.newMessage')
      // A withdrawn message has no text to preview.
      const preview = payload?.is_deleted ? t('chat.messageDeleted') : (payload?.body ?? '')
      const body = preview || t('chat.attachmentMessage')

      if (document.hidden) {
        notifyBrowser(from, body, () => open(conversationId))
        return
      }

      setToasts((current) => [
        // Replacing any existing card for the same thread rather than stacking
        // them: five messages from one person is one conversation to open.
        { id: conversationId, from, body },
        ...current.filter((toast) => toast.id !== conversationId),
      ].slice(0, MAX_VISIBLE))
    })

    return unsubscribe
  }, [subscribe, isAuthenticated, activeConversationRef, open, t])

  // Each card withdraws itself. A timer per card rather than one shared timer,
  // so a card that arrived later is not cut short by an earlier one's deadline.
  useEffect(() => {
    if (toasts.length === 0) return undefined
    const timers = toasts.map((toast) => setTimeout(() => dismiss(toast.id), DISMISS_MS))
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismiss])

  if (toasts.length === 0) return null

  return createPortal(
    <div
      // `pointer-events-none` on the stack and `auto` on each card, so the
      // gaps between them do not swallow clicks meant for the page.
      className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2"
      role="region"
      aria-label={t('chat.notifications')}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-3 shadow-[0_4px_16px_rgba(15,23,42,0.18)]"
        >
          <UserAvatar name={toast.from} />

          <button
            type="button"
            onClick={() => open(toast.id)}
            className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex items-center gap-1.5">
              <MessageSquare aria-hidden="true" size={12} className="shrink-0 text-primary" />
              <span className="truncate text-sm font-medium text-text-primary">{toast.from}</span>
            </span>
            <span className="mt-0.5 line-clamp-2 block text-xs text-text-secondary">
              {toast.body}
            </span>
          </button>

          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label={t('chat.dismiss')}
            className="flex size-6 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}

/**
 * The browser's own notification, for a tab nobody is looking at.
 *
 * Silent when permission was never granted: a blocked notification is not an
 * error to report, and the in-app card covers the case that matters most.
 */
function notifyBrowser(from, body, onClick) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    // `tag` keyed on the sender so a burst from one person replaces itself
    // rather than filling the notification centre.
    const notification = new Notification(from, { body, tag: `renthouse-chat-${from}` })
    notification.onclick = () => {
      window.focus()
      notification.close()
      onClick()
    }
  } catch {
    // Some browsers throw here instead of resolving to "denied". Either way
    // there is nothing to do and nothing worth telling the reader.
  }
}

/**
 * Asks for notification permission, once, the first time chat is opened.
 *
 * Tied to opening chat rather than to loading the app: a prompt that appears
 * before the reader has done anything is the one everybody blocks. Never asked
 * twice — a refusal is an answer.
 */
export function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'default') return
  try {
    if (window.localStorage.getItem(PERMISSION_ASKED_KEY)) return
    window.localStorage.setItem(PERMISSION_ASKED_KEY, '1')
  } catch {
    // Storage can be unavailable; asking once more is better than never.
  }
  Notification.requestPermission().catch(() => {})
}

export default MessageNotifications
