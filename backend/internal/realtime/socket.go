package realtime

import (
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

// Timings for the keepalive.
//
// A TCP connection can be dead for minutes without either end noticing — a
// laptop lid closing produces no FIN. Without a ping the hub would keep a
// vanished user marked online and keep writing into a socket nobody reads.
const (
	// pongWait is how long a connection may go without answering a ping.
	pongWait = 60 * time.Second
	// pingPeriod must be shorter than pongWait, or the deadline expires before
	// the next ping is even sent.
	pingPeriod = (pongWait * 9) / 10
	// maxMessageBytes caps one inbound frame. The client only ever sends small
	// control frames; anything larger is a bug or an attack.
	maxMessageBytes = 4 << 10
)

// Upgrader turns an HTTP request into a WebSocket.
//
// CheckOrigin is supplied by the caller rather than defaulted: gorilla's own
// default accepts same-origin only, which would reject the development
// frontend on :5173 talking to the API on :8081. The allow-list is the same one
// CORS uses, so the two cannot drift.
func NewUpgrader(allowedOrigins []string) *websocket.Upgrader {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		allowed[origin] = true
	}

	return &websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			// A request with no Origin is not a browser — curl, a health check,
			// a native client. Browsers always send one, and those are the ones
			// the same-origin rule exists to protect.
			if origin == "" {
				return true
			}
			if allowed[origin] {
				return true
			}
			// Same-origin: a page served by this server talking back to it. The
			// cross-origin allow-list exists to keep *other* sites out, and a
			// request from this one is not another site.
			if parsed, err := url.Parse(origin); err == nil && parsed.Host == r.Host {
				return true
			}
			return false
		},
	}
}

// SocketConn adapts a gorilla WebSocket to the hub's Connection interface.
//
// Writes are serialised through a single goroutine because a WebSocket permits
// only one writer at a time: two events published concurrently would otherwise
// interleave frames and corrupt the stream.
type SocketConn struct {
	ws   *websocket.Conn
	send chan []byte

	closeOnce sync.Once
	done      chan struct{}
}

func NewSocketConn(ws *websocket.Conn) *SocketConn {
	return &SocketConn{
		ws:   ws,
		send: make(chan []byte, sendBuffer),
		done: make(chan struct{}),
	}
}

// Send queues one payload.
//
// A full buffer means the client is not draining the socket. Dropping the
// connection is the right answer: the alternative is an unbounded queue held
// for someone who has stopped listening, and everything they miss is in the
// database for them to load on reconnect.
func (c *SocketConn) Send(payload []byte) error {
	select {
	case c.send <- payload:
		return nil
	case <-c.done:
		return websocket.ErrCloseSent
	default:
		c.Close()
		return websocket.ErrCloseSent
	}
}

// Close ends the connection once, however many goroutines ask.
func (c *SocketConn) Close() error {
	c.closeOnce.Do(func() {
		close(c.done)
		_ = c.ws.Close()
	})
	return nil
}

// Done is closed when the connection ends, so the caller can clean up.
func (c *SocketConn) Done() <-chan struct{} { return c.done }

// WritePump is the single writer. It also sends the periodic ping.
func (c *SocketConn) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Close()
	}()

	for {
		select {
		case payload, ok := <-c.send:
			if !ok {
				return
			}
			_ = c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.ws.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.ws.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}

		case <-c.done:
			return
		}
	}
}

// ReadPump drains inbound frames until the connection dies.
//
// The client sends nothing meaningful today — messages go over REST, which
// keeps validation and authorization in one place and gives the sender a real
// HTTP status to act on. Reading is still required: it is what delivers pong
// frames, and therefore what keeps the connection from being torn down as
// stale. `onMessage` exists so a future client-to-server event (typing, read
// acknowledgement) has somewhere to land.
func (c *SocketConn) ReadPump(onMessage func([]byte)) {
	defer c.Close()

	c.ws.SetReadLimit(maxMessageBytes)
	_ = c.ws.SetReadDeadline(time.Now().Add(pongWait))
	c.ws.SetPongHandler(func(string) error {
		return c.ws.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		_, payload, err := c.ws.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				logger.Errorf("realtime: read: %v", err)
			}
			return
		}
		if onMessage != nil {
			onMessage(payload)
		}
	}
}
