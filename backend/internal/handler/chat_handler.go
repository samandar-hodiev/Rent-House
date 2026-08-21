package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/internal/storage"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// ChatHandler is HTTP only: bind, call the service, map the result onto a
// status. Every rule about who may read or change a thread lives in the
// service, so the WebSocket path and the REST path cannot disagree.
type ChatHandler struct {
	chat *service.ChatService
}

func NewChatHandler(chat *service.ChatService) *ChatHandler {
	return &ChatHandler{chat: chat}
}

// StartConversation handles POST /api/v1/conversations.
//
// Idempotent by design: asking twice returns the same thread, because the
// button that calls it is pressed every time the modal opens.
func (h *ChatHandler) StartConversation(c *gin.Context) {
	actorID, ok := h.actor(c)
	if !ok {
		return
	}

	var req dto.StartConversationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	apartmentID, err := uuid.Parse(req.ApartmentID)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", "apartment_id must be a uuid")
		return
	}

	conversation, err := h.chat.StartConversation(c.Request.Context(), actorID, apartmentID)
	if err != nil {
		h.writeError(c, err, "start conversation")
		return
	}

	response.OK(c, "", conversation)
}

// ListConversations handles GET /api/v1/conversations.
func (h *ChatHandler) ListConversations(c *gin.Context) {
	actorID, ok := h.actor(c)
	if !ok {
		return
	}

	list, err := h.chat.ListConversations(c.Request.Context(), actorID)
	if err != nil {
		h.writeError(c, err, "list conversations")
		return
	}

	response.OK(c, "", list)
}

// GetConversation handles GET /api/v1/conversations/:id.
func (h *ChatHandler) GetConversation(c *gin.Context) {
	actorID, ok := h.actor(c)
	if !ok {
		return
	}
	conversationID, ok := parseConversationID(c)
	if !ok {
		return
	}

	conversation, err := h.chat.GetConversation(c.Request.Context(), conversationID, actorID)
	if err != nil {
		h.writeError(c, err, "get conversation")
		return
	}

	response.OK(c, "", conversation)
}

// ListMessages handles GET /api/v1/conversations/:id/messages.
func (h *ChatHandler) ListMessages(c *gin.Context) {
	actorID, ok := h.actor(c)
	if !ok {
		return
	}
	conversationID, ok := parseConversationID(c)
	if !ok {
		return
	}

	var query dto.MessageListQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	query.Normalize()

	page, err := h.chat.ListMessages(c.Request.Context(), conversationID, actorID, query)
	if err != nil {
		h.writeError(c, err, "list messages")
		return
	}

	response.OK(c, "", page)
}

// SendMessage handles POST /api/v1/conversations/:id/messages.
//
// Accepts JSON for a text message and multipart for one carrying a file. One
// endpoint rather than an upload followed by a send: there is no window in
// which a stored file has no message, nothing to clean up when a client
// abandons the second half, and the upload's own progress is the send's
// progress.
//
// Messages travel over HTTP, not the socket: validation, authorization and
// persistence then live in one place, and the sender gets a real status code to
// act on rather than silence. The socket is for delivery to everyone else.
func (h *ChatHandler) SendMessage(c *gin.Context) {
	actorID, ok := h.actor(c)
	if !ok {
		return
	}
	conversationID, ok := parseConversationID(c)
	if !ok {
		return
	}

	body, attachment, cleanup, ok := h.readMessage(c)
	if !ok {
		return
	}
	defer cleanup()

	message, err := h.chat.SendMessage(c.Request.Context(), conversationID, actorID, body, attachment)
	if err != nil {
		h.writeError(c, err, "send message")
		return
	}

	response.Success(c, http.StatusCreated, "", message)
}

// readMessage pulls the text and the optional file out of either encoding.
func (h *ChatHandler) readMessage(
	c *gin.Context,
) (body string, attachment *service.Attachment, cleanup func(), ok bool) {
	cleanup = func() {}

	if !strings.HasPrefix(c.ContentType(), "multipart/form-data") {
		var req dto.SendMessageRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
			return "", nil, cleanup, false
		}
		req.Normalize()
		return req.Body, nil, cleanup, true
	}

	header, err := c.FormFile("file")
	if err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed",
			"Attach a file in the 'file' field")
		return "", nil, cleanup, false
	}

	// Checked before the file is opened, so an oversized upload is refused
	// without reading it. Storage re-checks while reading, because a declared
	// size is only a claim.
	kind, known := storage.KindForContentType(header.Header.Get("Content-Type"))
	if !known {
		response.Error(c, http.StatusUnsupportedMediaType, "unsupported_type",
			"This file type is not accepted")
		return "", nil, cleanup, false
	}
	if header.Size > kind.MaxBytes {
		response.Error(c, http.StatusRequestEntityTooLarge, "file_too_large",
			"The file is larger than the limit for its type")
		return "", nil, cleanup, false
	}

	file, err := header.Open()
	if err != nil {
		logger.Errorf("send message: open upload: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return "", nil, cleanup, false
	}
	cleanup = func() { _ = file.Close() }

	attachment = &service.Attachment{
		Reader:       file,
		ContentType:  header.Header.Get("Content-Type"),
		OriginalName: header.Filename,
	}
	// A voice note carries its length, which the recorder knows and the server
	// would otherwise have to decode the file to learn.
	if raw := strings.TrimSpace(c.PostForm("duration_seconds")); raw != "" {
		if seconds, err := strconv.Atoi(raw); err == nil && seconds >= 0 && seconds <= 3600 {
			attachment.DurationSeconds = &seconds
		}
	}

	return strings.TrimSpace(c.PostForm("body")), attachment, cleanup, true
}

// DownloadAttachment handles GET /api/v1/attachments/:id.
//
// Authorization happens before any bytes are read: an attachment is as private
// as the conversation it was sent in.
//
// The token may arrive as a query parameter as well as a header, because a
// browser cannot set headers on an <img> or an <audio> source. It is the same
// short-lived access token the rest of the API uses.
func (h *ChatHandler) DownloadAttachment(c *gin.Context) {
	actorID, ok := h.actor(c)
	if !ok {
		return
	}
	attachmentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusNotFound, "attachment_not_found", "Attachment not found")
		return
	}

	attachment, file, err := h.chat.OpenAttachment(c.Request.Context(), attachmentID, actorID)
	if err != nil {
		h.writeError(c, err, "download attachment")
		return
	}
	defer file.Close()

	// The name is quoted and already stripped of control characters by the
	// storage layer, so it cannot split this header.
	disposition := "inline"
	if attachment.Kind == storage.KindFile {
		// Documents are offered as downloads; pictures and audio are played in
		// place.
		disposition = "attachment"
	}
	c.Header("Content-Disposition",
		fmt.Sprintf("%s; filename=%q", disposition, attachment.OriginalName))
	c.Header("Content-Type", attachment.MimeType)
	// Private: a shared cache must not hold one conversation's files and serve
	// them to another reader.
	c.Header("Cache-Control", "private, max-age=3600")
	c.Header("X-Content-Type-Options", "nosniff")

	http.ServeContent(c.Writer, c.Request, attachment.OriginalName, attachment.CreatedAt, file)
}

// AttachmentLimits handles GET /api/v1/attachments/limits.
//
// The client reads its file-picker filters and its size checks from here, so
// the rules are stated once, on the server that enforces them.
func (h *ChatHandler) AttachmentLimits(c *gin.Context) {
	limit := func(name string) dto.AttachmentLimit {
		kind := storage.Kinds[name]
		return dto.AttachmentLimit{MaxBytes: kind.MaxBytes, MimeTypes: kind.MimeTypes()}
	}
	response.OK(c, "", dto.AttachmentLimits{
		Image: limit(storage.KindImage),
		File:  limit(storage.KindFile),
		Audio: limit(storage.KindAudio),
	})
}

// MarkRead handles POST /api/v1/conversations/:id/read.
func (h *ChatHandler) MarkRead(c *gin.Context) {
	actorID, ok := h.actor(c)
	if !ok {
		return
	}
	conversationID, ok := parseConversationID(c)
	if !ok {
		return
	}

	receipt, err := h.chat.MarkRead(c.Request.Context(), conversationID, actorID)
	if err != nil {
		h.writeError(c, err, "mark read")
		return
	}

	response.OK(c, "", receipt)
}

// EditMessage handles PATCH /api/v1/messages/:id.
func (h *ChatHandler) EditMessage(c *gin.Context) {
	actorID, ok := h.actor(c)
	if !ok {
		return
	}
	messageID, ok := parseMessageID(c)
	if !ok {
		return
	}

	var req dto.EditMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	req.Normalize()

	message, err := h.chat.EditMessage(c.Request.Context(), messageID, actorID, req.Body)
	if err != nil {
		h.writeError(c, err, "edit message")
		return
	}

	response.OK(c, "", message)
}

// DeleteMessage handles DELETE /api/v1/messages/:id.
func (h *ChatHandler) DeleteMessage(c *gin.Context) {
	actorID, ok := h.actor(c)
	if !ok {
		return
	}
	messageID, ok := parseMessageID(c)
	if !ok {
		return
	}

	var req dto.DeleteMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}

	message, err := h.chat.DeleteMessage(c.Request.Context(), messageID, actorID, req.Scope)
	if err != nil {
		h.writeError(c, err, "delete message")
		return
	}

	// "Delete for me" changes nothing the other side can see, so there is no
	// message to return.
	if message == nil {
		response.OK(c, "", gin.H{"scope": req.Scope})
		return
	}
	response.OK(c, "", message)
}

// UnreadTotal handles GET /api/v1/conversations/unread.
func (h *ChatHandler) UnreadTotal(c *gin.Context) {
	actorID, ok := h.actor(c)
	if !ok {
		return
	}

	total, err := h.chat.UnreadTotal(c.Request.Context(), actorID)
	if err != nil {
		h.writeError(c, err, "count unread")
		return
	}

	response.OK(c, "", gin.H{"unread_total": total})
}

// --- internals -------------------------------------------------------------

func (h *ChatHandler) actor(c *gin.Context) (uuid.UUID, bool) {
	actorID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return uuid.Nil, false
	}
	return actorID, true
}

// writeError maps a service error onto a status and a stable code.
func (h *ChatHandler) writeError(c *gin.Context, err error, operation string) {
	switch {
	case errors.Is(err, service.ErrConversationNotFound):
		// Also covers "not a participant": a stranger must not be able to tell
		// a thread they cannot see from one that does not exist.
		response.Error(c, http.StatusNotFound, "conversation_not_found", "Conversation not found")
	case errors.Is(err, service.ErrMessageNotFound):
		response.Error(c, http.StatusNotFound, "message_not_found", "Message not found")
	case errors.Is(err, service.ErrNotMessageAuthor):
		response.Error(c, http.StatusForbidden, "not_message_author",
			"This message belongs to another user")
	case errors.Is(err, service.ErrApartmentNotFound):
		response.Error(c, http.StatusNotFound, "apartment_not_found", "Apartment not found")
	case errors.Is(err, service.ErrCannotMessageSelf):
		response.Error(c, http.StatusBadRequest, "cannot_message_self",
			"You cannot start a conversation about your own listing")
	case errors.Is(err, service.ErrMessageDeleted):
		response.Error(c, http.StatusConflict, "message_deleted",
			"This message has been deleted")
	case errors.Is(err, service.ErrEmptyMessage):
		response.Error(c, http.StatusBadRequest, "validation_failed", "The message is empty")
	case errors.Is(err, service.ErrUnsupportedAttachment):
		response.Error(c, http.StatusUnsupportedMediaType, "unsupported_type",
			"This file type is not accepted")
	case errors.Is(err, service.ErrAttachmentTooLarge):
		response.Error(c, http.StatusRequestEntityTooLarge, "file_too_large",
			"The file is larger than the limit for its type")
	case errors.Is(err, service.ErrAttachmentNotFound):
		response.Error(c, http.StatusNotFound, "attachment_not_found", "Attachment not found")
	case errors.Is(err, service.ErrAttachmentNotEditable):
		response.Error(c, http.StatusConflict, "attachment_not_editable",
			"An attachment message cannot be edited")
	default:
		logger.Errorf("%s: %v", operation, err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
	}
}

// parseConversationID reads the :id path parameter for a conversation route.
func parseConversationID(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusNotFound, "conversation_not_found", "Conversation not found")
		return uuid.Nil, false
	}
	return id, true
}

// parseMessageID reads the :id path parameter for a message route.
func parseMessageID(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusNotFound, "message_not_found", "Message not found")
		return uuid.Nil, false
	}
	return id, true
}
