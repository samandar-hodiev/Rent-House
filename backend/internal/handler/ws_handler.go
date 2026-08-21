package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/samandar-hodiev/Rent-House/backend/internal/realtime"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// WSHandler upgrades a request to a WebSocket and keeps it registered with the
// hub for as long as it lives.
//
// The socket carries events outward only. Sending, editing and deleting all go
// over REST, so authorization and validation exist in one place and the sender
// receives a status code rather than silence. This connection's job is delivery
// and presence.
type WSHandler struct {
	hub      *realtime.Hub
	chat     *service.ChatService
	tokens   *token.Service
	upgrader *websocket.Upgrader
}

// presenceQueryTimeout bounds the lookup that finds who to tell.
const presenceQueryTimeout = 5 * time.Second

func NewWSHandler(
	hub *realtime.Hub, chat *service.ChatService, tokens *token.Service, allowedOrigins []string,
) *WSHandler {
	return &WSHandler{
		hub:      hub,
		chat:     chat,
		tokens:   tokens,
		upgrader: realtime.NewUpgrader(allowedOrigins),
	}
}

// Connect handles GET /api/v1/ws.
//
// The token arrives as a query parameter, not an Authorization header: the
// browser's WebSocket API cannot set headers on the handshake. That makes the
// token visible in a URL, so it is read once here and the connection is
// authenticated for its lifetime — it is never logged, and the access token is
// short-lived by design.
func (h *WSHandler) Connect(c *gin.Context) {
	raw := strings.TrimSpace(c.Query("token"))
	if raw == "" {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	userID, err := h.tokens.Validate(raw)
	if err != nil {
		// Rejected before the upgrade, so the client sees a real HTTP status
		// rather than an immediately-closed socket.
		response.Error(c, http.StatusUnauthorized, "invalid_token", "Invalid token")
		return
	}

	ws, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		// Upgrade already wrote its own response.
		logger.Errorf("ws: upgrade: %v", err)
		return
	}

	conn := realtime.NewSocketConn(ws)
	becameOnline := h.hub.Register(userID, conn)
	go conn.WritePump()

	// Presence is announced to the people who can see it — those sharing a
	// thread with this user — rather than broadcast to everyone connected.
	if becameOnline {
		h.announcePresence(userID, true)
	}

	// Blocks until the socket dies, which is what keeps the request (and this
	// connection) alive. Nothing meaningful arrives from the client today; the
	// read is what delivers pong frames and detects a dead peer.
	conn.ReadPump(nil)

	if wentOffline := h.hub.Unregister(userID, conn); wentOffline {
		h.announcePresence(userID, false)
	}
}

// announcePresence tells this user's counterparts that they came or went.
//
// It runs on a background context, not the request's: the request context is
// cancelled the instant the socket closes, which is precisely when the offline
// announcement needs to query the database.
func (h *WSHandler) announcePresence(userID uuid.UUID, online bool) {
	ctx, cancel := context.WithTimeout(context.Background(), presenceQueryTimeout)
	defer cancel()

	counterparts, err := h.chat.CounterpartsOf(ctx, userID)
	if err != nil {
		// Presence is a nicety; failing to announce it must not take anything
		// else down.
		return
	}
	h.hub.PublishPresence(counterparts, userID, online)
}
