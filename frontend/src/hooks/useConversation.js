import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import {
  deleteMessage as deleteMessageRequest,
  editMessage as editMessageRequest,
  fetchMessages,
  markConversationRead,
  sendAttachment,
  sendMessage as sendMessageRequest,
} from '../services/chatApi'
import { CHAT_EVENTS, SOCKET_STATUS } from '../services/chatSocket'

/**
 * One open thread: its messages, its paging, and the realtime events that
 * change it.
 *
 * Shared by the apartment-detail modal and the dashboard, which is what makes
 * them one chat rather than two implementations of the same idea. Both mount
 * this against a conversation id and get identical behaviour.
 */
/**
 * One open thread.
 *
 * `apartmentId` is the listing the reader arrived from, recorded on every
 * message sent while it is set. It does not select the thread — the pair does
 * that — it says what a message is about, so one conversation can hold
 * messages about several listings and still tell them apart.
 */
export function useConversation(conversationId, apartmentId = null) {
  const { token, user } = useAuth()
  const { subscribe, markRead, socketStatus } = useChat()
  const myId = user?.id ?? null

  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)

  // The oldest message held, which is the cursor for the next page back.
  const cursor = useRef(null)

  // First page. Replaces whatever was there: switching threads must not leave
  // the previous one's messages on screen.
  useEffect(() => {
    if (!conversationId || !token) {
      setMessages([])
      setStatus('idle')
      return undefined
    }

    const controller = new AbortController()
    setStatus('loading')
    setMessages([])
    cursor.current = null

    fetchMessages(conversationId, { token, signal: controller.signal })
      .then((page) => {
        setMessages(page.items)
        setHasMore(page.hasMore)
        cursor.current = page.nextBefore
        setStatus('ready')
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setStatus('error')
      })

    return () => controller.abort()
  }, [conversationId, token])

  // Opening a thread reads it. The server decides which messages actually
  // changed and tells the sender, so their ticks turn double without either
  // side refetching.
  useEffect(() => {
    if (!conversationId || !token || status !== 'ready') return
    markConversationRead(conversationId, { token })
      .then(() => markRead(conversationId))
      .catch(() => {
        // A failed receipt is not worth interrupting the reader for; the badge
        // corrects itself on the next load.
      })
  }, [conversationId, token, status, markRead])

  // Realtime updates for this thread.
  useEffect(() => {
    if (!conversationId) return undefined

    return subscribe((envelope) => {
      if (envelope.conversation_id !== conversationId) return
      const payload = envelope.payload

      switch (envelope.event) {
        case CHAT_EVENTS.messageNew:
          setMessages((current) =>
            // The sender receives their own message back for their other tabs,
            // and the POST already added it here. Keyed on id so the echo is
            // absorbed rather than shown twice.
            current.some((message) => message.id === payload.id)
              ? current
              : [...current, normalize(payload)],
          )
          break

        case CHAT_EVENTS.messageEdited:
        case CHAT_EVENTS.messageDeleted:
          setMessages((current) =>
            current.map((message) =>
              message.id === payload.id ? normalize(payload) : message,
            ),
          )
          break

        case CHAT_EVENTS.messagesRead: {
          const read = new Set(payload.message_ids ?? [])
          setMessages((current) =>
            current.map((message) =>
              read.has(message.id)
                ? { ...message, isRead: true, readAt: payload.read_at }
                : message,
            ),
          )
          break
        }

        default:
          break
      }
    })
  }, [conversationId, subscribe])

  // Recovery after a reconnect.
  //
  // The socket is a delivery channel, not the record: anything sent while it
  // was down was never pushed to this client and would otherwise be missing
  // until a manual reload. On every transition back to open, the newest page is
  // refetched and merged — the database is the source of truth, and this is
  // where that principle actually earns its keep.
  const wasOpen = useRef(socketStatus === SOCKET_STATUS.open)
  useEffect(() => {
    const isOpen = socketStatus === SOCKET_STATUS.open
    const reconnected = isOpen && !wasOpen.current
    wasOpen.current = isOpen

    if (!reconnected || !conversationId || !token) return

    fetchMessages(conversationId, { token, limit: 30 })
      .then((page) => {
        setMessages((current) => {
          // Merged by id, so a message this client already has — because the
          // POST returned it, or because the socket delivered it before the
          // drop — is not shown twice.
          const held = new Set(current.map((message) => message.id))
          const missed = page.items.filter((message) => !held.has(message.id))
          if (missed.length === 0) return current
          return [...current, ...missed].sort(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
          )
        })
      })
      .catch(() => {
        // The next reconnect tries again; nothing is lost, only delayed.
      })
  }, [socketStatus, conversationId, token])

  /** Loads the page before the oldest message held. */
  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder || !cursor.current) return
    setLoadingOlder(true)
    try {
      const page = await fetchMessages(conversationId, {
        token,
        limit: 30,
        before: cursor.current,
      })
      setMessages((current) => {
        // Filtered by id: a message arriving while the older page was in flight
        // could otherwise appear in both.
        const held = new Set(current.map((message) => message.id))
        return [...page.items.filter((message) => !held.has(message.id)), ...current]
      })
      setHasMore(page.hasMore)
      cursor.current = page.nextBefore
    } catch {
      // Leaving `hasMore` set means the button stays available to retry.
    } finally {
      setLoadingOlder(false)
    }
  }, [conversationId, token, hasMore, loadingOlder])

  /** Sends a message. The POST's response is what lands in the list. */
  const send = useCallback(
    async (body) => {
      const text = body.trim()
      if (!text || sending) return false

      setSending(true)
      setSendError(null)
      try {
        const message = await sendMessageRequest(conversationId, text, { token, apartmentId })
        setMessages((current) =>
          current.some((item) => item.id === message.id) ? current : [...current, message],
        )
        return true
      } catch {
        setSendError('failed')
        return false
      } finally {
        setSending(false)
      }
    },
    [conversationId, token, sending, apartmentId],
  )

  /**
   * Sends a file — image, document or voice note — with real progress.
   *
   * `onProgress` is fed by the upload's own byte counter, and the returned
   * `abort` cancels it. Nothing is added to the list until the server has
   * answered: a message that failed to upload must not appear as though it
   * had been sent.
   */
  const sendFile = useCallback(
    ({ file, body = '', durationSeconds, onProgress }) => {
      const { promise, abort } = sendAttachment(conversationId, {
        file,
        body,
        durationSeconds,
        apartmentId,
        token,
        onProgress,
      })

      const done = promise.then((message) => {
        setMessages((current) =>
          current.some((item) => item.id === message.id) ? current : [...current, message],
        )
        return message
      })

      return { promise: done, abort }
    },
    [conversationId, token, apartmentId],
  )

  const edit = useCallback(
    async (messageId, body) => {
      const text = body.trim()
      if (!text) return false
      try {
        const updated = await editMessageRequest(messageId, text, { token })
        setMessages((current) =>
          current.map((message) => (message.id === messageId ? updated : message)),
        )
        return true
      } catch {
        return false
      }
    },
    [token],
  )

  /**
   * Removes a message.
   *
   * `me` drops it from this list alone — the other side keeps it, and no event
   * is broadcast. `everyone` withdraws it, and the row stays in place showing
   * that it was deleted so the thread keeps its shape.
   */
  const remove = useCallback(
    async (messageId, scope) => {
      try {
        await deleteMessageRequest(messageId, scope, { token })
        setMessages((current) =>
          scope === 'me'
            ? current.filter((message) => message.id !== messageId)
            : current.map((message) =>
                message.id === messageId
                  ? { ...message, isDeleted: true, body: '', isEdited: false }
                  : message,
              ),
        )
        return true
      } catch {
        return false
      }
    },
    [token],
  )

  return {
    messages,
    myId,
    status,
    isLoading: status === 'loading',
    hasMore,
    loadingOlder,
    loadOlder,
    sending,
    sendError,
    clearSendError: () => setSendError(null),
    send,
    sendFile,
    edit,
    remove,
  }
}

/** The socket sends the same shape the REST endpoints do, in snake_case. */
function normalize(payload) {
  return {
    id: payload.id,
    conversationId: payload.conversation_id,
    senderId: payload.sender_id,
    kind: payload.kind ?? 'text',
    body: payload.body,
    attachment: payload.attachment
      ? {
          id: payload.attachment.id,
          kind: payload.attachment.kind,
          name: payload.attachment.name,
          url: payload.attachment.url,
          mimeType: payload.attachment.mime_type,
          sizeBytes: payload.attachment.size_bytes,
          durationSeconds: payload.attachment.duration_seconds ?? null,
        }
      : null,
    isRead: payload.is_read,
    isEdited: payload.is_edited,
    isDeleted: payload.is_deleted,
    createdAt: payload.created_at,
    readAt: payload.read_at ?? null,
    editedAt: payload.edited_at ?? null,
  }
}
