package dto

import (
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// Message paging. Thirty is roughly two screens, so opening a thread shows a
// full scrollback without fetching a history nobody scrolls to.
const (
	DefaultMessageLimit = 30
	MaxMessageLimit     = 100
)

// MaxMessageLength bounds one message. Long enough for an address and
// directions, short enough that the column and the socket frame stay sane.
const MaxMessageLength = 4000

// --- requests --------------------------------------------------------------

// StartConversationRequest is the body of POST /api/v1/conversations.
//
// It names the apartment and nothing else. Who is enquiring comes from the
// token, and who owns the listing comes from the listing — accepting either
// from the client would let one user open a thread in another's name.
type StartConversationRequest struct {
	ApartmentID string `json:"apartment_id" binding:"required,uuid"`
}

// SendMessageRequest is the body of POST /api/v1/conversations/:id/messages.
type SendMessageRequest struct {
	Body string `json:"body" binding:"required,min=1,max=4000"`
}

// Normalize trims the text. A message of only whitespace is not a message, and
// the CHECK constraint on the column refuses it anyway.
func (r *SendMessageRequest) Normalize() { r.Body = strings.TrimSpace(r.Body) }

// EditMessageRequest is the body of PATCH /api/v1/messages/:id.
type EditMessageRequest struct {
	Body string `json:"body" binding:"required,min=1,max=4000"`
}

func (r *EditMessageRequest) Normalize() { r.Body = strings.TrimSpace(r.Body) }

// DeleteMessageScope decides who stops seeing a deleted message.
const (
	// DeleteScopeMe hides it from the caller alone.
	DeleteScopeMe = "me"
	// DeleteScopeEveryone withdraws it from both sides. Only the author may.
	DeleteScopeEveryone = "everyone"
)

// DeleteMessageRequest is the body of DELETE /api/v1/messages/:id.
type DeleteMessageRequest struct {
	Scope string `json:"scope" binding:"required,oneof=me everyone"`
}

// MessageListQuery is the query string of the messages endpoint.
type MessageListQuery struct {
	Limit int `form:"limit" binding:"omitempty,min=1,max=100"`
	// Before is the oldest message the client already holds. Cursor rather than
	// offset: a thread grows while it is being read, and an offset would shift
	// under the reader.
	Before string `form:"before" binding:"omitempty,uuid"`
}

func (q *MessageListQuery) Normalize() {
	if q.Limit < 1 {
		q.Limit = DefaultMessageLimit
	}
	if q.Limit > MaxMessageLimit {
		q.Limit = MaxMessageLimit
	}
}

// --- responses -------------------------------------------------------------

// ChatUserResponse is a participant as chat shows them: enough to put a name
// and initials in a header, and nothing else about the account.
type ChatUserResponse struct {
	ID     uuid.UUID `json:"id"`
	Name   string    `json:"name"`
	Online bool      `json:"online"`
}

// ChatApartmentResponse is the listing a thread is about.
type ChatApartmentResponse struct {
	ID    uuid.UUID `json:"id"`
	Title string    `json:"title"`
	Image string    `json:"image,omitempty"`
}

// MessageResponse is one message.
//
// A withdrawn message keeps its place in the thread and loses its text: the
// client renders "this message was deleted" where it stood, so the conversation
// does not develop an unexplained gap.
type MessageResponse struct {
	ID             uuid.UUID `json:"id"`
	ConversationID uuid.UUID `json:"conversation_id"`
	SenderID       uuid.UUID `json:"sender_id"`
	Body           string    `json:"body"`

	IsRead   bool `json:"is_read"`
	IsEdited bool `json:"is_edited"`
	// IsDeleted means withdrawn for everyone. A message hidden by "delete for
	// me" is simply absent for that reader.
	IsDeleted bool `json:"is_deleted"`

	CreatedAt time.Time  `json:"created_at"`
	ReadAt    *time.Time `json:"read_at,omitempty"`
	EditedAt  *time.Time `json:"edited_at,omitempty"`
}

// NewMessageResponse converts a stored message into its API shape.
func NewMessageResponse(message *models.Message) MessageResponse {
	out := MessageResponse{
		ID:             message.ID,
		ConversationID: message.ConversationID,
		SenderID:       message.SenderID,
		Body:           message.Body,
		IsRead:         message.IsRead,
		IsEdited:       message.EditedAt != nil,
		IsDeleted:      message.DeletedAt != nil,
		CreatedAt:      message.CreatedAt,
		ReadAt:         message.ReadAt,
		EditedAt:       message.EditedAt,
	}
	if out.IsDeleted {
		// Never send the text of a withdrawn message, whatever the row holds.
		out.Body = ""
		out.EditedAt = nil
		out.IsEdited = false
	}
	return out
}

// MessagePageResponse is one page of a thread, oldest first.
type MessagePageResponse struct {
	Items []MessageResponse `json:"items"`
	// HasMore says older messages exist behind this page.
	HasMore bool `json:"has_more"`
	// NextBefore is the cursor for the next page, absent when there is none.
	NextBefore string `json:"next_before,omitempty"`
}

// ConversationResponse is one thread as the list and the header show it.
type ConversationResponse struct {
	ID        uuid.UUID             `json:"id"`
	Apartment ChatApartmentResponse `json:"apartment"`
	// Other is the person on the other side, which is who the UI names.
	Other       ChatUserResponse `json:"other"`
	LastMessage *LastMessage     `json:"last_message,omitempty"`
	UnreadCount int64            `json:"unread_count"`
	UpdatedAt   time.Time        `json:"updated_at"`
}

// LastMessage is the preview line in the conversation list.
type LastMessage struct {
	Body      string    `json:"body"`
	SenderID  uuid.UUID `json:"sender_id"`
	IsDeleted bool      `json:"is_deleted"`
	CreatedAt time.Time `json:"created_at"`
}

// ConversationListResponse is the sidebar, plus the badge total so the client
// does not have to add up the rows itself and disagree with the server.
type ConversationListResponse struct {
	Items       []ConversationResponse `json:"items"`
	UnreadTotal int64                  `json:"unread_total"`
}

// ReadReceipt is the payload of a read event: which messages just turned
// double-ticked, and when.
type ReadReceipt struct {
	ConversationID uuid.UUID   `json:"conversation_id"`
	MessageIDs     []uuid.UUID `json:"message_ids"`
	ReaderID       uuid.UUID   `json:"reader_id"`
	ReadAt         time.Time   `json:"read_at"`
}
