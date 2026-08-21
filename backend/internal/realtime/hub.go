// Package realtime delivers chat events to connected users.
//
// The hub is a registry of live connections keyed by user id, and nothing more.
// It stores no messages and makes no decisions: the service writes to the
// database first and then asks the hub to tell whoever is listening. A delivery
// that fails — the recipient closed the tab a moment ago — is not an error,
// because the message is already saved and will be there when they return.
//
// Deliberately in-process. A second server instance would need its connections
// to hear about the first's, which is what Redis pub/sub is for; that is a
// deployment concern, and the interface here does not change when it arrives.
package realtime

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

// Event names the client understands. One string per thing that can happen to a
// thread, so a client can switch on it rather than inspect the payload's shape.
const (
	// EventMessageNew carries a message that was just sent.
	EventMessageNew = "message.new"
	// EventMessageEdited carries a message whose text changed.
	EventMessageEdited = "message.edited"
	// EventMessageDeleted carries a message withdrawn from both sides.
	EventMessageDeleted = "message.deleted"
	// EventMessagesRead lists messages the other side has now read, so the
	// sender's ticks can turn double without a refetch.
	EventMessagesRead = "messages.read"
	// EventPresence reports that a user came online or went offline.
	EventPresence = "presence"
)

// Envelope is what travels over the socket in both directions.
//
// One shape with a discriminator rather than a union of types: a client parses
// it once, and adding an event later does not change the framing.
type Envelope struct {
	Event string `json:"event"`
	// ConversationID scopes the event. Empty for account-wide events such as
	// presence.
	ConversationID string `json:"conversation_id,omitempty"`
	Payload        any    `json:"payload,omitempty"`
}

// writeWait bounds how long a slow client may block a write before it is
// treated as gone.
const writeWait = 10 * time.Second

// sendBuffer is how many events may queue for one connection. A client that
// falls this far behind is not keeping up and is disconnected rather than
// allowed to grow the queue without limit; it reconnects and refetches.
const sendBuffer = 32

// Connection is one live socket. The hub only needs somewhere to put bytes, so
// this is an interface: tests use a fake, production uses the WebSocket.
type Connection interface {
	// Send queues one event. It must not block indefinitely.
	Send(payload []byte) error
	// Close ends the connection.
	Close() error
}

// Hub tracks who is connected.
//
// A user may have several connections at once — two tabs, a phone and a laptop
// — so the value is a set. Presence is "at least one connection open", which is
// why online status is derived here and never stored in the database: a process
// that crashes leaves no stale "online" row behind.
type Hub struct {
	mu          sync.RWMutex
	connections map[uuid.UUID]map[Connection]struct{}
}

func NewHub() *Hub {
	return &Hub{connections: make(map[uuid.UUID]map[Connection]struct{})}
}

// Register adds a connection and reports whether this user was previously
// offline, so the caller can announce their arrival only once.
func (h *Hub) Register(userID uuid.UUID, conn Connection) (becameOnline bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	set, existed := h.connections[userID]
	if !existed {
		set = make(map[Connection]struct{})
		h.connections[userID] = set
	}
	set[conn] = struct{}{}
	return !existed
}

// Unregister removes a connection and reports whether the user has now gone
// offline entirely — closing one of three tabs is not going offline.
func (h *Hub) Unregister(userID uuid.UUID, conn Connection) (wentOffline bool) {
	h.mu.Lock()
	defer h.mu.Unlock()

	set, ok := h.connections[userID]
	if !ok {
		return false
	}
	delete(set, conn)
	if len(set) > 0 {
		return false
	}
	delete(h.connections, userID)
	return true
}

// IsOnline reports whether a user has any connection open.
func (h *Hub) IsOnline(userID uuid.UUID) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.connections[userID]
	return ok
}

// OnlineAmong filters a set of users down to those currently connected, for a
// conversation list that shows a dot next to each name.
func (h *Hub) OnlineAmong(userIDs []uuid.UUID) map[uuid.UUID]bool {
	h.mu.RLock()
	defer h.mu.RUnlock()

	online := make(map[uuid.UUID]bool, len(userIDs))
	for _, id := range userIDs {
		if _, ok := h.connections[id]; ok {
			online[id] = true
		}
	}
	return online
}

// Publish delivers one event to every connection of every listed user.
//
// Errors are logged, not returned: the database already holds the truth, and a
// recipient who is not reachable will load it on their next request. Failing
// the caller's request because a third party's socket closed would turn someone
// else's network problem into your failure to send a message.
func (h *Hub) Publish(userIDs []uuid.UUID, envelope Envelope) {
	payload, err := json.Marshal(envelope)
	if err != nil {
		logger.Errorf("realtime: encode %s: %v", envelope.Event, err)
		return
	}

	// The connections are copied under the lock and written to outside it, so a
	// slow socket cannot hold up every other delivery in the process.
	h.mu.RLock()
	targets := make([]Connection, 0, len(userIDs))
	for _, userID := range userIDs {
		for conn := range h.connections[userID] {
			targets = append(targets, conn)
		}
	}
	h.mu.RUnlock()

	for _, conn := range targets {
		if err := conn.Send(payload); err != nil {
			// The read loop notices the closed socket and unregisters it; this
			// only needs to stop writing to it.
			logger.Errorf("realtime: deliver %s: %v", envelope.Event, err)
		}
	}
}

// PresencePayload is the body of a presence event.
type PresencePayload struct {
	UserID string `json:"user_id"`
	Online bool   `json:"online"`
}

// PublishPresence tells a set of users that someone's status changed.
func (h *Hub) PublishPresence(audience []uuid.UUID, userID uuid.UUID, online bool) {
	h.Publish(audience, Envelope{
		Event:   EventPresence,
		Payload: PresencePayload{UserID: userID.String(), Online: online},
	})
}
