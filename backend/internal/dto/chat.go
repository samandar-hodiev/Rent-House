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
//
// Either text or an attachment; the service rejects a request carrying neither.
// The attachment is referenced by the id an earlier upload returned — the bytes
// travelled over HTTP, not through this JSON and not through the socket.
type SendMessageRequest struct {
	Body         string `json:"body"          binding:"omitempty,max=4000"`
	AttachmentID string `json:"attachment_id" binding:"omitempty,uuid"`
	// ApartmentID is the listing the sender was looking at. Context, not
	// routing: it does not decide which thread the message lands in — the pair
	// does that — it records what the message is about.
	ApartmentID string `json:"apartment_id" binding:"omitempty,uuid"`
	// ReplyToMessageID is the message this one answers. Verified server-side to
	// belong to the same thread, so a reply cannot be used to quote a message
	// out of a conversation the sender is not in.
	ReplyToMessageID string `json:"reply_to_message_id" binding:"omitempty,uuid"`
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

// DeleteMessagesRequest is the body of POST /api/v1/messages/delete, which
// removes a selection in one action.
//
// The same two scopes and the same permission rules as the single-message
// endpoint — this is one round trip instead of many, not a second set of rules.
// The cap is what one selection can reasonably hold and bounds the work a
// single request can ask for.
type DeleteMessagesRequest struct {
	IDs   []string `json:"ids"   binding:"required,min=1,max=100,dive,uuid"`
	Scope string   `json:"scope" binding:"required,oneof=me everyone"`
}

// DeleteMessagesResponse reports what the selection did.
type DeleteMessagesResponse struct {
	// Deleted are the messages withdrawn for both sides, so the client can
	// replace exactly those bubbles. Empty for a "delete for me", where nothing
	// about the messages themselves changed.
	Deleted []MessageResponse `json:"deleted"`
	// Count is how many messages the action covered, under either scope.
	Count int `json:"count"`
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
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	// Avatar is the path to their picture, absent when they have not uploaded
	// one — the client falls back to initials, as it does everywhere else.
	Avatar string `json:"avatar,omitempty"`
	Online bool   `json:"online"`
}

// ChatApartmentResponse is the listing a thread is about.
type ChatApartmentResponse struct {
	ID    uuid.UUID `json:"id"`
	Title string    `json:"title"`
	Image string    `json:"image,omitempty"`
	// District and price make the pinned context worth pinning: enough to
	// recognise the listing without leaving the conversation.
	District     string `json:"district,omitempty"`
	Price        string `json:"price,omitempty"`
	Currency     string `json:"currency,omitempty"`
	RentalPeriod string `json:"rental_period,omitempty"`
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
	// Kind is text, image, file or audio, so the client picks a renderer
	// without inspecting the attachment.
	Kind       string              `json:"kind"`
	Body       string              `json:"body"`
	Attachment *AttachmentResponse `json:"attachment,omitempty"`

	IsRead   bool `json:"is_read"`
	IsEdited bool `json:"is_edited"`
	// IsDeleted means withdrawn for everyone. A message hidden by "delete for
	// me" is simply absent for that reader.
	IsDeleted bool `json:"is_deleted"`

	// ApartmentID is the listing this message was written about, when the
	// sender had one in view. Context: the same conversation can hold messages
	// about several listings, and this is what tells them apart.
	ApartmentID *uuid.UUID `json:"apartment_id,omitempty"`

	// ReplyTo is the message this one answers, when it answers one. Absent
	// rather than empty when it does not, and when the quoted message has since
	// been hard-removed.
	ReplyTo *MessageQuoteResponse `json:"reply_to,omitempty"`

	CreatedAt time.Time  `json:"created_at"`
	ReadAt    *time.Time `json:"read_at,omitempty"`
	EditedAt  *time.Time `json:"edited_at,omitempty"`
}

// NewMessageResponse converts a stored message into its API shape.
// MessageQuoteResponse is the message a reply answers, reduced to what the
// quote line renders. Not the full message: a quote needs a line of text and
// who said it, and nesting whole messages would let one reply drag an entire
// chain of earlier ones into the response.
type MessageQuoteResponse struct {
	ID       uuid.UUID `json:"id"`
	SenderID uuid.UUID `json:"sender_id"`
	Kind     string    `json:"kind"`
	Body     string    `json:"body"`
	// IsDeleted lets the quote say "this message was deleted" in place of text
	// that must not be sent.
	IsDeleted bool `json:"is_deleted"`
}

func newMessageQuote(message *models.Message) *MessageQuoteResponse {
	if message == nil {
		return nil
	}
	out := &MessageQuoteResponse{
		ID:        message.ID,
		SenderID:  message.SenderID,
		Kind:      message.Kind,
		Body:      message.Body,
		IsDeleted: message.DeletedAt != nil,
	}
	// A withdrawn message's text is not sent anywhere, quotes included.
	if out.IsDeleted {
		out.Body = ""
	}
	return out
}

func NewMessageResponse(message *models.Message) MessageResponse {
	out := MessageResponse{
		ApartmentID:    message.ApartmentID,
		ReplyTo:        newMessageQuote(message.ReplyTo),
		ID:             message.ID,
		ConversationID: message.ConversationID,
		SenderID:       message.SenderID,
		Kind:           message.Kind,
		Body:           message.Body,
		Attachment:     NewAttachmentResponse(message.Attachment),
		IsRead:         message.IsRead,
		IsEdited:       message.EditedAt != nil,
		IsDeleted:      message.DeletedAt != nil,
		CreatedAt:      message.CreatedAt,
		ReadAt:         message.ReadAt,
		EditedAt:       message.EditedAt,
	}
	if out.IsDeleted {
		// Never send the text of a withdrawn message, whatever the row holds —
		// nor a link to its attachment, which stops being readable the moment
		// the message is withdrawn.
		out.Body = ""
		out.Attachment = nil
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
	// Apartments are the listings this thread's messages refer to, keyed from
	// each message's apartment_id.
	//
	// Sent as a set beside the messages rather than embedded in each one: a run
	// of twenty messages about the same listing would otherwise repeat its
	// title, price and image twenty times. The client renders the card that
	// introduces each run by looking the id up here.
	Apartments []ChatApartmentResponse `json:"apartments"`
}

// ConversationResponse is one thread as the list and the header show it.
type ConversationResponse struct {
	ID uuid.UUID `json:"id"`
	// Apartment is the thread's current context — the listing most recently
	// written about — and is absent when that listing has been withdrawn or
	// the pair have never named one.
	Apartment *ChatApartmentResponse `json:"apartment,omitempty"`
	// Other is the person on the other side, which is who the UI names.
	Other       ChatUserResponse `json:"other"`
	LastMessage *LastMessage     `json:"last_message,omitempty"`
	UnreadCount int64            `json:"unread_count"`
	UpdatedAt   time.Time        `json:"updated_at"`

	// This caller's own view of the thread. Another participant reading the
	// same conversation gets their own answers here.
	IsPinned   bool `json:"is_pinned"`
	IsArchived bool `json:"is_archived"`

	// Whether messages are barred, and which way round. The two mean different
	// things to the interface: one offers a way to undo it, the other only
	// explains why sending fails.
	IsBlocked   bool `json:"is_blocked"`
	IsBlockedBy bool `json:"is_blocked_by"`
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
	Items []ConversationResponse `json:"items"`
	// UnreadTotal is how many messages are waiting; UnreadConversations is how
	// many threads they are spread across. The header badge shows the second —
	// thirty messages from one person is one conversation to open.
	UnreadTotal         int64 `json:"unread_total"`
	UnreadConversations int64 `json:"unread_conversations"`
}

// ReadReceipt is the payload of a read event: which messages just turned
// double-ticked, and when.
type ReadReceipt struct {
	ConversationID uuid.UUID   `json:"conversation_id"`
	MessageIDs     []uuid.UUID `json:"message_ids"`
	ReaderID       uuid.UUID   `json:"reader_id"`
	ReadAt         time.Time   `json:"read_at"`
}

// --- attachments -----------------------------------------------------------

// AttachmentResponse is a file sent in a conversation.
//
// StoredPath is deliberately absent: the client asks for the attachment by id
// and the server decides where it lives, so an internal filesystem layout is
// never something a browser has seen.
type AttachmentResponse struct {
	ID   uuid.UUID `json:"id"`
	Kind string    `json:"kind"`
	Name string    `json:"name"`
	// URL is the protected endpoint for this attachment, not a path on disk.
	URL       string `json:"url"`
	MimeType  string `json:"mime_type"`
	SizeBytes int64  `json:"size_bytes"`
	// DurationSeconds is set for audio, so a player can show a length before
	// the file has loaded.
	DurationSeconds *int `json:"duration_seconds,omitempty"`
}

// NewAttachmentResponse converts a stored attachment into its API shape.
func NewAttachmentResponse(attachment *models.MessageAttachment) *AttachmentResponse {
	if attachment == nil {
		return nil
	}
	return &AttachmentResponse{
		ID:              attachment.ID,
		Kind:            attachment.Kind,
		Name:            attachment.OriginalName,
		URL:             attachment.URL,
		MimeType:        attachment.MimeType,
		SizeBytes:       attachment.SizeBytes,
		DurationSeconds: attachment.DurationSeconds,
	}
}

// UploadedAttachment is what an upload hands back, ready to be attached to a
// message. The client sends the id straight back in SendMessageRequest.
type UploadedAttachment struct {
	AttachmentResponse
}

// AttachmentLimits tells the client what it may send, so the file picker and
// the size check are driven by the server rather than by numbers restated in
// the frontend and left to drift.
type AttachmentLimits struct {
	Image AttachmentLimit `json:"image"`
	File  AttachmentLimit `json:"file"`
	Audio AttachmentLimit `json:"audio"`
}

// AttachmentLimit is one kind's rules.
type AttachmentLimit struct {
	MaxBytes  int64    `json:"max_bytes"`
	MimeTypes []string `json:"mime_types"`
}

// ConversationDeletedEvent announces a thread withdrawn from both sides.
type ConversationDeletedEvent struct {
	ConversationID string `json:"conversation_id"`
}

// ConversationStateRequest is a pin or archive toggle. The conversation comes
// from the path and the user from the token, so the body carries only the
// intent.
type ConversationStateRequest struct {
	Value bool `json:"value"`
}

// DeleteConversationRequest chooses between hiding a thread and withdrawing it.
type DeleteConversationRequest struct {
	ForEveryone bool `json:"for_everyone"`
}

// BlockUserRequest is the body of POST /api/v1/me/blocks/:userId.
//
// Both fields are optional: blocking someone must not require explaining
// yourself, and a mandatory reason would only produce noise.
type BlockUserRequest struct {
	Reason     string `json:"reason"      binding:"omitempty,oneof=spam fake_listing harassment abuse suspicious other"`
	ReasonText string `json:"reason_text" binding:"omitempty,max=500"`
}

// BlockStateResponse is one person's standing with another.
type BlockStateResponse struct {
	IsBlocked   bool `json:"is_blocked"`
	IsBlockedBy bool `json:"is_blocked_by"`
}

// BlockedUserResponse is one row of the blocked-users list.
//
// Enough to recognise the person and remember why, and nothing more: the list
// exists to be reviewed and undone, not to be studied.
type BlockedUserResponse struct {
	UserID string `json:"user_id"`
	Name   string `json:"name"`
	Avatar string `json:"avatar,omitempty"`

	// Reason is one of the accepted categories, absent when none was given —
	// blocking somebody never required explaining yourself.
	Reason *string `json:"reason,omitempty"`
	// ReasonText is what they typed alongside it, if anything.
	ReasonText *string `json:"reason_text,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}

// BlockedUserListResponse is the whole list.
type BlockedUserListResponse struct {
	Items []BlockedUserResponse `json:"items"`
	Total int                   `json:"total"`
}
