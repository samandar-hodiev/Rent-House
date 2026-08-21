// The realtime channel.
//
// One connection per signed-in session, not one per conversation: the server
// pushes events for every thread the user is in, and a socket per open modal
// would multiply connections for no gain. ChatContext owns the single instance
// and fans events out to whoever is listening.

// Event names, mirroring internal/realtime/hub.go. Kept as constants so a typo
// is a build-time missing export rather than a listener that silently never
// fires.
export const CHAT_EVENTS = {
  messageNew: 'message.new',
  messageEdited: 'message.edited',
  messageDeleted: 'message.deleted',
  messagesRead: 'messages.read',
  presence: 'presence',
}

/** Connection states the UI reports to the user. */
export const SOCKET_STATUS = {
  connecting: 'connecting',
  open: 'open',
  reconnecting: 'reconnecting',
  closed: 'closed',
}

// Backoff for reconnects. A server restart drops every socket at once; without
// a growing delay they would all return immediately and in step, and keep doing
// so until it came back.
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 15000

/** Derives the socket URL from the configured API base, so one setting governs both. */
function socketURL(token) {
  const base = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1'
  const url = new URL(base.replace(/\/$/, '') + '/ws', window.location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  // The browser's WebSocket API cannot set headers on the handshake, so the
  // token travels as a query parameter. The server validates it before the
  // upgrade and never logs it.
  url.searchParams.set('token', token)
  return url.toString()
}

/**
 * Opens a managed connection.
 *
 * Returns a handle with `close()`. Reconnects on its own until closed, so a
 * caller never has to reason about retry — only about the events and the
 * status it is handed.
 */
export function openChatSocket({ token, onEvent, onStatus }) {
  let ws = null
  let attempt = 0
  let reconnectTimer = null
  // Set by close(), and checked before every reconnect: without it, a socket
  // closing *because* we closed it would schedule a retry for a session that
  // has already ended.
  let closedByCaller = false

  const setStatus = (status) => onStatus?.(status)

  const connect = () => {
    if (closedByCaller) return

    setStatus(attempt === 0 ? SOCKET_STATUS.connecting : SOCKET_STATUS.reconnecting)
    ws = new WebSocket(socketURL(token))

    ws.onopen = () => {
      attempt = 0
      setStatus(SOCKET_STATUS.open)
    }

    ws.onmessage = (event) => {
      let envelope
      try {
        envelope = JSON.parse(event.data)
      } catch {
        // A frame we cannot read is not worth tearing the connection down for.
        return
      }
      onEvent?.(envelope)
    }

    ws.onclose = () => {
      if (closedByCaller) {
        setStatus(SOCKET_STATUS.closed)
        return
      }
      // Exponential backoff with a ceiling, jittered so a fleet of tabs does
      // not return in lockstep and knock the server over again.
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS)
      const jittered = delay * (0.5 + Math.random() / 2)
      attempt += 1
      setStatus(SOCKET_STATUS.reconnecting)
      reconnectTimer = setTimeout(connect, jittered)
    }

    // onerror is followed by onclose, which already handles the retry; this
    // only stops the default unhandled-rejection noise in the console.
    ws.onerror = () => {}
  }

  connect()

  return {
    close() {
      closedByCaller = true
      clearTimeout(reconnectTimer)
      // Detached before closing so the handler cannot schedule a reconnect for
      // a socket the caller has finished with.
      if (ws) {
        ws.onclose = null
        ws.onmessage = null
        ws.onerror = null
        ws.close()
      }
      setStatus(SOCKET_STATUS.closed)
    },
  }
}
