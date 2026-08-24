import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './AuthContext'
import {
  blockUser,
  deleteConversation as deleteConversationRequest,
  fetchConversations,
  setConversationArchived,
  setConversationPinned,
  startConversation as startConversationRequest,
  unblockUser,
} from '../services/chatApi'
import { CHAT_EVENTS, SOCKET_STATUS, openChatSocket } from '../services/chatSocket'

const ChatContext = createContext(null)

// Unsent text, kept per conversation. In localStorage rather than memory alone
// so a draft survives a reload the way it survives a navigation — somebody who
// half-wrote a message and closed the tab expects to find it again.
const DRAFTS_KEY = 'renthouse_chat_drafts'

function readStoredDrafts() {
  if (typeof window === 'undefined') return {}
  try {
    const stored = JSON.parse(window.localStorage.getItem(DRAFTS_KEY) ?? '{}')
    // Anything that is not a plain map of strings is discarded rather than
    // trusted: this is user-writable storage.
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(
      Object.entries(stored).filter(([, value]) => typeof value === 'string' && value !== ''),
    )
  } catch {
    return {}
  }
}

/**
 * Owns the conversation list, the unread badge and the single WebSocket.
 *
 * One socket per session, held here rather than per screen: the server pushes
 * events for every thread the user is in, so the apartment-detail modal and the
 * dashboard both listen to the same connection and stay in step without either
 * knowing the other exists. That is also what makes them one chat system rather
 * than two — a message sent from the modal appears in the dashboard list
 * immediately, because both read this state.
 *
 * PostgreSQL is the source of truth; this is a cache of what the server last
 * said, updated by events as they arrive.
 */
export function ChatProvider({ children }) {
  const { token, user, isAuthenticated } = useAuth()
  // Whose messages are "mine". Needed because the server echoes a sender's
  // own message back for their other tabs, and that echo must not raise
  // their own unread count.
  const myId = user?.id ?? null

  const [conversations, setConversations] = useState([])
  // The archive is a separate list because it is a separate query: same shape,
  // one predicate apart, so neither can disagree with the other about a thread.
  const [archivedConversations, setArchivedConversations] = useState([])
  const [archivedStatus, setArchivedStatus] = useState('idle')
  // Two figures, kept apart because they answer different questions. The
  // badges show how many people are waiting; the dashboard's card is labelled
  // "unread messages" and shows how many messages.
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [unreadConversations, setUnreadConversations] = useState(0)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [socketStatus, setSocketStatus] = useState(SOCKET_STATUS.closed)

  // Which thread is open on screen, if any. A message arriving in the thread
  // the reader is already looking at needs no notification — they can see it.
  // A ref rather than state: it is read inside the socket handler, and making
  // it state would rebuild that handler on every navigation.
  const activeConversationRef = useRef(null)
  const setActiveConversation = useCallback((conversationId) => {
    activeConversationRef.current = conversationId
  }, [])

  // Unsent text per conversation. Keyed by id so two half-written messages
  // cannot reach the wrong thread.
  const [drafts, setDrafts] = useState(readStoredDrafts)

  const setDraft = useCallback((conversationId, text) => {
    setDrafts((current) => {
      const trimmed = text ?? ''
      if ((current[conversationId] ?? '') === trimmed) return current
      const next = { ...current }
      // An emptied draft is removed rather than stored as "", so the list has
      // one thing to check and storage does not fill with blanks.
      if (trimmed === '') delete next[conversationId]
      else next[conversationId] = trimmed
      return next
    })
  }, [])

  const clearDraft = useCallback((conversationId) => setDraft(conversationId, ''), [setDraft])

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
    } catch {
      // Private-browsing mode can refuse writes. The draft then lasts as long
      // as the tab, which is a degraded experience rather than a broken one.
    }
  }, [drafts])

  // Screens subscribe to raw events so a thread can apply the ones for the
  // conversation it is showing. A ref rather than state: adding a listener must
  // not re-render every consumer.
  const listeners = useRef(new Set())

  const subscribe = useCallback((listener) => {
    listeners.current.add(listener)
    return () => listeners.current.delete(listener)
  }, [])

  const reload = useCallback(
    async (signal) => {
      if (!token) {
        setConversations([])
        setArchivedConversations([])
        setUnreadTotal(0)
        setUnreadConversations(0)
        setStatus('idle')
        setArchivedStatus('idle')
        return
      }
      setStatus('loading')
      setArchivedStatus('loading')
      try {
        // Both lists together: archiving moves a thread from one to the other,
        // and refetching only the one in view would leave the other stale.
        const [inbox, archive] = await Promise.all([
          fetchConversations({ token, signal }),
          fetchConversations({ token, signal, archived: true }),
        ])
        setConversations(inbox.items)
        setArchivedConversations(archive.items)
        setUnreadTotal(inbox.unreadTotal)
        setUnreadConversations(inbox.unreadConversations)
        setStatus('ready')
        setArchivedStatus('ready')
      } catch (error) {
        if (error?.name === 'AbortError') return
        setStatus('error')
        setArchivedStatus('error')
      }
    },
    [token],
  )

  // Reloads when the session changes: signing out must not leave the previous
  // account's threads on screen.
  useEffect(() => {
    const controller = new AbortController()
    reload(controller.signal)
    return () => controller.abort()
  }, [reload])

  // Read inside the event handler, which is created once per session — refs
  // keep them current without making the socket reconnect on every render.
  const myIdRef = useRef(myId)
  myIdRef.current = myId
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  // Keeps the list and the badge in step with what just happened.
  const applyEvent = useCallback((envelope) => {
    const { event, conversation_id: conversationId, payload } = envelope

    if (event === CHAT_EVENTS.presence) {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.other.id === payload.user_id
            ? { ...conversation, other: { ...conversation.other, online: payload.online } }
            : conversation,
        ),
      )
      return
    }

    if (event === CHAT_EVENTS.messageNew) {
      setConversations((current) => {
        const index = current.findIndex((conversation) => conversation.id === conversationId)
        // A thread this session has never seen: somebody just opened a
        // conversation about one of this user's listings, and its first message
        // arrived before the list knew it existed. The row cannot be built from
        // the event — a message carries no apartment title, no counterpart name
        // — so the list is refetched. Without this the recipient sees nothing
        // until they reload the page, which is exactly what realtime is for.
        if (index === -1) {
          reloadRef.current()
          return current
        }

        const conversation = current[index]
        // The sender's own echo, for their other tabs, must not raise their own
        // unread count.
        const isMine = payload.sender_id === myIdRef.current
        // Neither must a message arriving in the thread the reader is looking
        // at. It is on screen the moment it lands, so counting it as unread
        // would put a badge on a conversation they are in the middle of
        // reading. `document.hidden` is the qualifier: the thread can be
        // "open" in a tab that is not in front, and that message really is
        // unread.
        const isBeingRead = activeConversationRef.current === conversationId && !document.hidden
        const updated = {
          ...conversation,
          lastMessage: {
            body: payload.body,
            senderId: payload.sender_id,
            isDeleted: payload.is_deleted,
            createdAt: payload.created_at,
          },
          unreadCount:
            isMine || isBeingRead ? conversation.unreadCount : conversation.unreadCount + 1,
          updatedAt: payload.created_at,
        }
        // Most recently active first.
        return [updated, ...current.slice(0, index), ...current.slice(index + 1)]
      })
      return
    }

    if (event === CHAT_EVENTS.conversationDeleted) {
      // Withdrawn from both sides by the other participant. It is gone on the
      // server, so it goes from here too rather than waiting for a reload to
      // reveal that it never came back.
      const id = payload?.conversation_id ?? conversationId
      setConversations((current) => current.filter((conversation) => conversation.id !== id))
      setArchivedConversations((current) =>
        current.filter((conversation) => conversation.id !== id),
      )
      return
    }

    if (event === CHAT_EVENTS.messagesRead) {
      // Somebody read messages. If it was this user, their badge drops.
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
        ),
      )
    }
  }, [])

  // The socket lives exactly as long as the session does.
  useEffect(() => {
    if (!token) {
      setSocketStatus(SOCKET_STATUS.closed)
      return undefined
    }

    const socket = openChatSocket({
      token,
      onStatus: setSocketStatus,
      onEvent: (envelope) => {
        // The list is refreshed from the event rather than refetched: a new
        // message has to move its thread to the top and bump a badge, and a
        // round trip for every arrival would be a request per message.
        applyEvent(envelope)
        listeners.current.forEach((listener) => listener(envelope))
      },
    })

    return () => socket.close()
    // `applyEvent` is stable — useCallback with no changing dependencies — so
    // the socket is tied to the session alone and is not torn down by a render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Both figures are derived from the rows on screen, so neither can disagree
  // with the list — and a message arriving over the socket moves them without
  // a request.
  //
  // The conversation count is how many rows have anything unread, not how many
  // messages are unread: twenty more messages from someone already waiting
  // leaves the badge where it was, because it is still one person to reply to.
  useEffect(() => {
    let messages = 0
    let threads = 0
    for (const conversation of conversations) {
      if (conversation.unreadCount <= 0) continue
      messages += conversation.unreadCount
      threads += 1
    }
    setUnreadTotal(messages)
    setUnreadConversations(threads)
  }, [conversations])

  /** Opens the thread about a listing, or returns the one already open. */
  const startConversation = useCallback(
    async (apartmentId) => {
      const conversation = await startConversationRequest(apartmentId, { token })
      setConversations((current) =>
        current.some((item) => item.id === conversation.id)
          ? current.map((item) => (item.id === conversation.id ? conversation : item))
          : [conversation, ...current],
      )
      return conversation
    },
    [token],
  )

  /**
   * Pin, archive and delete.
   *
   * Each waits for the server and then refetches rather than editing the array
   * in place: pinning reorders the list, archiving removes a row from one list
   * and adds it to another, and deleting can revive a thread later. Re-reading
   * is one request and cannot drift; reproducing those rules in the client
   * would be a second copy of the ordering logic.
   */
  const setPinned = useCallback(
    async (conversationId, pinned) => {
      await setConversationPinned(conversationId, pinned, { token })
      await reloadRef.current()
    },
    [token],
  )

  const setArchived = useCallback(
    async (conversationId, archived) => {
      await setConversationArchived(conversationId, archived, { token })
      await reloadRef.current()
    },
    [token],
  )

  const removeConversation = useCallback(
    async (conversationId, { forEveryone = false } = {}) => {
      await deleteConversationRequest(conversationId, { forEveryone, token })
      await reloadRef.current()
    },
    [token],
  )

  /**
   * Blocks or unblocks the other person in a thread.
   *
   * Refetches afterwards rather than editing in place: the block changes what
   * the composer may do and what the list reports, and both read it from the
   * same server response.
   */
  const setBlocked = useCallback(
    async (userId, blocked, { reason, reasonText } = {}) => {
      await (blocked
        ? blockUser(userId, { reason, reasonText, token })
        : unblockUser(userId, { token }))
      await reloadRef.current()
    },
    [token],
  )

  /** Clears a thread's badge locally; the server call lives in the thread view. */
  const markRead = useCallback((conversationId) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
      ),
    )
  }, [])

  const value = useMemo(
    () => ({
      conversations,
      archivedConversations,
      archivedStatus,
      unreadTotal,
      unreadConversations,
      status,
      isLoading: status === 'loading',
      socketStatus,
      isAuthenticated,
      subscribe,
      drafts,
      setDraft,
      clearDraft,
      activeConversationRef,
      setActiveConversation,
      startConversation,
      markRead,
      setPinned,
      setArchived,
      removeConversation,
      setBlocked,
      reload: () => reload(),
    }),
    [
      conversations,
      archivedConversations,
      archivedStatus,
      unreadTotal,
      unreadConversations,
      status,
      socketStatus,
      isAuthenticated,
      subscribe,
      drafts,
      setDraft,
      clearDraft,
      setActiveConversation,
      startConversation,
      markRead,
      setPinned,
      setArchived,
      removeConversation,
      setBlocked,
      reload,
    ],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) throw new Error('useChat must be used inside ChatProvider')
  return context
}
