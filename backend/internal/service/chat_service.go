package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/realtime"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
)

// Errors the chat service reports. Each maps to one HTTP status in the handler.
var (
	// ErrConversationNotFound covers both "no such thread" and "not yours".
	// They are deliberately indistinguishable to a stranger: telling someone a
	// conversation exists but is not theirs leaks that it exists at all.
	ErrConversationNotFound = errors.New("conversation not found")

	// ErrMessageNotFound is a message that does not exist, or one in a thread
	// the caller is not part of.
	ErrMessageNotFound = errors.New("message not found")

	// ErrNotMessageAuthor is editing or withdrawing someone else's message.
	// Unlike the two above, the caller is a legitimate participant here, so
	// "this is not yours" is the accurate answer and reveals nothing new.
	ErrNotMessageAuthor = errors.New("message belongs to another user")

	// ErrCannotMessageSelf is an owner opening a thread with themselves about
	// their own listing.
	ErrCannotMessageSelf = errors.New("cannot start a conversation with yourself")

	// ErrMessageDeleted is editing a message that has been withdrawn.
	ErrMessageDeleted = errors.New("message has been deleted")

	// ErrEmptyMessage is a body that is only whitespace.
	ErrEmptyMessage = errors.New("message is empty")
)

// ChatService owns the chat rules: who may read a thread, who may change a
// message, and who hears about it.
//
// Every write goes to the database first and is broadcast second. The reverse
// order would let a recipient see a message that failed to save.
type ChatService struct {
	chat       *repository.ChatRepository
	apartments *repository.ApartmentRepository
	users      *repository.UserRepository
	hub        *realtime.Hub
	now        func() time.Time
}

func NewChatService(
	chat *repository.ChatRepository,
	apartments *repository.ApartmentRepository,
	users *repository.UserRepository,
	hub *realtime.Hub,
) *ChatService {
	return &ChatService{chat: chat, apartments: apartments, users: users, hub: hub, now: time.Now}
}

// SetClock replaces the service's clock. Tests only.
func (s *ChatService) SetClock(now func() time.Time) { s.now = now }

// StartConversation returns the thread between this user and a listing's owner,
// opening it the first time.
//
// The caller is the enquirer and the owner comes from the listing, so neither
// side of the thread is anything the client chose.
func (s *ChatService) StartConversation(
	ctx context.Context, actorID, apartmentID uuid.UUID,
) (*dto.ConversationResponse, error) {
	apartment, err := s.apartments.FindByID(ctx, apartmentID)
	if err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return nil, ErrApartmentNotFound
		}
		return nil, err
	}

	// A published listing can be asked about; a draft cannot, because nobody
	// but its owner should know it exists.
	if apartment.Status != models.ApartmentStatusActive && apartment.OwnerID != actorID {
		return nil, ErrApartmentNotFound
	}
	if apartment.OwnerID == actorID {
		return nil, ErrCannotMessageSelf
	}

	conversation, err := s.chat.FindOrCreateConversation(ctx, apartmentID, actorID, apartment.OwnerID)
	if err != nil {
		return nil, err
	}

	return s.describe(ctx, conversation.ID, actorID)
}

// ListConversations returns the caller's threads for the dashboard sidebar.
func (s *ChatService) ListConversations(
	ctx context.Context, actorID uuid.UUID,
) (*dto.ConversationListResponse, error) {
	summaries, err := s.chat.ListConversations(ctx, actorID)
	if err != nil {
		return nil, err
	}

	// Presence is asked once for the whole page rather than per row.
	others := make([]uuid.UUID, 0, len(summaries))
	for _, summary := range summaries {
		others = append(others, summary.OtherUserID)
	}
	online := s.hub.OnlineAmong(others)

	items := make([]dto.ConversationResponse, 0, len(summaries))
	var unreadTotal int64
	for _, summary := range summaries {
		items = append(items, conversationFrom(summary, online[summary.OtherUserID]))
		unreadTotal += summary.UnreadCount
	}

	return &dto.ConversationListResponse{Items: items, UnreadTotal: unreadTotal}, nil
}

// GetConversation returns one thread, for the chat header.
func (s *ChatService) GetConversation(
	ctx context.Context, conversationID, actorID uuid.UUID,
) (*dto.ConversationResponse, error) {
	if err := s.assertParticipant(ctx, conversationID, actorID); err != nil {
		return nil, err
	}
	return s.describe(ctx, conversationID, actorID)
}

// ListMessages returns one page of a thread, oldest first.
func (s *ChatService) ListMessages(
	ctx context.Context, conversationID, actorID uuid.UUID, query dto.MessageListQuery,
) (*dto.MessagePageResponse, error) {
	if err := s.assertParticipant(ctx, conversationID, actorID); err != nil {
		return nil, err
	}

	var before *uuid.UUID
	if query.Before != "" {
		cursor, err := uuid.Parse(query.Before)
		if err != nil {
			return nil, ErrMessageNotFound
		}
		before = &cursor
	}

	page, err := s.chat.ListMessages(ctx, conversationID, actorID, query.Limit, before)
	if err != nil {
		return nil, err
	}

	items := make([]dto.MessageResponse, 0, len(page.Messages))
	for i := range page.Messages {
		items = append(items, dto.NewMessageResponse(&page.Messages[i]))
	}

	out := &dto.MessagePageResponse{Items: items, HasMore: page.HasMore}
	// The cursor for the next page is the oldest message on this one.
	if page.HasMore && len(items) > 0 {
		out.NextBefore = items[0].ID.String()
	}
	return out, nil
}

// SendMessage stores a message and pushes it to whoever is connected.
func (s *ChatService) SendMessage(
	ctx context.Context, conversationID, actorID uuid.UUID, body string,
) (*dto.MessageResponse, error) {
	if err := s.assertParticipant(ctx, conversationID, actorID); err != nil {
		return nil, err
	}
	if strings.TrimSpace(body) == "" {
		return nil, ErrEmptyMessage
	}

	message := &models.Message{
		ConversationID: conversationID,
		SenderID:       actorID,
		Body:           body,
	}
	if err := s.chat.CreateMessage(ctx, message); err != nil {
		return nil, err
	}

	response := dto.NewMessageResponse(message)
	// Saved first, announced second: a recipient must never see a message that
	// failed to persist.
	s.broadcast(ctx, conversationID, realtime.EventMessageNew, response)
	return &response, nil
}

// EditMessage rewrites a message the caller wrote.
func (s *ChatService) EditMessage(
	ctx context.Context, messageID, actorID uuid.UUID, body string,
) (*dto.MessageResponse, error) {
	message, err := s.authorizeMessage(ctx, messageID, actorID, true)
	if err != nil {
		return nil, err
	}
	if message.DeletedAt != nil {
		return nil, ErrMessageDeleted
	}
	if strings.TrimSpace(body) == "" {
		return nil, ErrEmptyMessage
	}

	editedAt := s.now().UTC()
	if err := s.chat.UpdateMessageBody(ctx, messageID, body, editedAt); err != nil {
		return nil, err
	}

	message.Body = body
	message.EditedAt = &editedAt

	response := dto.NewMessageResponse(message)
	s.broadcast(ctx, message.ConversationID, realtime.EventMessageEdited, response)
	return &response, nil
}

// DeleteMessage hides a message from the caller, or withdraws it from both.
//
// Hiding is available to either participant for any message: it affects only
// what they see. Withdrawing changes what the other person sees, so it belongs
// to the author alone.
func (s *ChatService) DeleteMessage(
	ctx context.Context, messageID, actorID uuid.UUID, scope string,
) (*dto.MessageResponse, error) {
	authorOnly := scope == dto.DeleteScopeEveryone
	message, err := s.authorizeMessage(ctx, messageID, actorID, authorOnly)
	if err != nil {
		return nil, err
	}

	if scope == dto.DeleteScopeMe {
		if err := s.chat.HideMessageForUser(ctx, messageID, actorID); err != nil {
			return nil, err
		}
		// Nothing is broadcast: the other side's view has not changed.
		return nil, nil
	}

	// Withdrawing something already withdrawn is not an error; the caller wants
	// it gone, and it is.
	if message.DeletedAt == nil {
		deletedAt := s.now().UTC()
		if err := s.chat.SoftDeleteMessage(ctx, messageID, deletedAt); err != nil {
			return nil, err
		}
		message.DeletedAt = &deletedAt
	}

	response := dto.NewMessageResponse(message)
	s.broadcast(ctx, message.ConversationID, realtime.EventMessageDeleted, response)
	return &response, nil
}

// MarkRead marks the other side's messages as read and tells them so.
func (s *ChatService) MarkRead(
	ctx context.Context, conversationID, actorID uuid.UUID,
) (*dto.ReadReceipt, error) {
	if err := s.assertParticipant(ctx, conversationID, actorID); err != nil {
		return nil, err
	}

	readAt := s.now().UTC()
	ids, err := s.chat.MarkRead(ctx, conversationID, actorID, readAt)
	if err != nil {
		return nil, err
	}

	receipt := &dto.ReadReceipt{
		ConversationID: conversationID,
		MessageIDs:     ids,
		ReaderID:       actorID,
		ReadAt:         readAt,
	}

	// Nothing changed means nothing to announce — re-opening a thread must not
	// re-broadcast its whole history.
	if len(ids) > 0 {
		s.broadcast(ctx, conversationID, realtime.EventMessagesRead, receipt)
	}
	return receipt, nil
}

// UnreadTotal is the badge figure for the header and the sidebar.
func (s *ChatService) UnreadTotal(ctx context.Context, actorID uuid.UUID) (int64, error) {
	return s.chat.UnreadTotal(ctx, actorID)
}

// ConversationsOf lists the users the given user shares a thread with, so a
// presence change can be announced to the people it matters to rather than
// broadcast to everyone connected.
func (s *ChatService) CounterpartsOf(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	summaries, err := s.chat.ListConversations(ctx, userID)
	if err != nil {
		return nil, err
	}
	others := make([]uuid.UUID, 0, len(summaries))
	for _, summary := range summaries {
		others = append(others, summary.OtherUserID)
	}
	return others, nil
}

// --- internals -------------------------------------------------------------

// assertParticipant is the authorization gate every read and write passes.
func (s *ChatService) assertParticipant(
	ctx context.Context, conversationID, actorID uuid.UUID,
) error {
	member, err := s.chat.IsParticipant(ctx, conversationID, actorID)
	if err != nil {
		return err
	}
	if !member {
		return ErrConversationNotFound
	}
	return nil
}

// authorizeMessage loads a message and checks the caller may act on it.
//
// Membership comes first: a stranger must not be able to tell a message they
// cannot see from one that does not exist.
func (s *ChatService) authorizeMessage(
	ctx context.Context, messageID, actorID uuid.UUID, authorOnly bool,
) (*models.Message, error) {
	message, err := s.chat.FindMessage(ctx, messageID)
	if err != nil {
		if errors.Is(err, repository.ErrMessageNotFound) {
			return nil, ErrMessageNotFound
		}
		return nil, err
	}

	if err := s.assertParticipant(ctx, message.ConversationID, actorID); err != nil {
		return nil, ErrMessageNotFound
	}
	if authorOnly && message.SenderID != actorID {
		return nil, ErrNotMessageAuthor
	}
	return message, nil
}

// broadcast pushes an event to everyone in a thread, including the sender —
// their other tabs need it too.
func (s *ChatService) broadcast(
	ctx context.Context, conversationID uuid.UUID, event string, payload any,
) {
	participants, err := s.chat.ParticipantIDs(ctx, conversationID)
	if err != nil {
		// The write already succeeded; a failure to announce it is not a
		// failure of the request.
		return
	}
	s.hub.Publish(participants, realtime.Envelope{
		Event:          event,
		ConversationID: conversationID.String(),
		Payload:        payload,
	})
}

// describe builds one conversation response by finding it in the caller's list,
// which is the query that already knows how to compute the other participant,
// the last message and the unread count.
func (s *ChatService) describe(
	ctx context.Context, conversationID, actorID uuid.UUID,
) (*dto.ConversationResponse, error) {
	summaries, err := s.chat.ListConversations(ctx, actorID)
	if err != nil {
		return nil, err
	}
	for _, summary := range summaries {
		if summary.ConversationID == conversationID {
			response := conversationFrom(summary, s.hub.IsOnline(summary.OtherUserID))
			return &response, nil
		}
	}
	return nil, ErrConversationNotFound
}

// conversationFrom turns a list row into its API shape.
func conversationFrom(summary repository.ConversationSummary, online bool) dto.ConversationResponse {
	out := dto.ConversationResponse{
		ID: summary.ConversationID,
		Apartment: dto.ChatApartmentResponse{
			ID:    summary.ApartmentID,
			Title: summary.ApartmentTitle,
		},
		Other: dto.ChatUserResponse{
			ID:     summary.OtherUserID,
			Name:   strings.TrimSpace(summary.OtherFirstName + " " + summary.OtherLastName),
			Online: online,
		},
		UnreadCount: summary.UnreadCount,
		UpdatedAt:   summary.UpdatedAt,
	}
	if summary.ApartmentImage != nil {
		out.Apartment.Image = *summary.ApartmentImage
	}

	if summary.LastMessageAt != nil {
		last := &dto.LastMessage{
			SenderID:  uuid.Nil,
			CreatedAt: *summary.LastMessageAt,
			IsDeleted: summary.LastMessageDeletedAt != nil,
		}
		if summary.LastMessageSenderID != nil {
			last.SenderID = *summary.LastMessageSenderID
		}
		// A withdrawn message shows as withdrawn in the preview too, never as
		// its old text.
		if !last.IsDeleted && summary.LastMessageBody != nil {
			last.Body = *summary.LastMessageBody
		}
		out.LastMessage = last
	}

	return out
}
