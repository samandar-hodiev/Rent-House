package service

import (
	"context"
	"errors"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/realtime"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/storage"
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

	// ErrBlocked is a message between two people where one has blocked the
	// other. Which direction is deliberately not distinguished here: the send
	// path treats both the same, and the handler is what decides how much to
	// say to whom.
	ErrBlocked = errors.New("messages are blocked between these users")

	// ErrCannotBlockSelf is exactly what it says. The database refuses it too.
	ErrCannotBlockSelf = errors.New("cannot block yourself")

	// ErrCannotMessageSelf is an owner opening a thread with themselves about
	// their own listing.
	ErrCannotMessageSelf = errors.New("cannot start a conversation with yourself")

	// ErrMessageDeleted is editing a message that has been withdrawn.
	ErrMessageDeleted = errors.New("message has been deleted")

	// ErrEmptyMessage is a message with neither text nor an attachment.
	ErrEmptyMessage = errors.New("message is empty")

	// ErrUnsupportedAttachment is a file type the server does not accept.
	ErrUnsupportedAttachment = errors.New("attachment type is not supported")

	// ErrAttachmentTooLarge is a file above its kind's ceiling.
	ErrAttachmentTooLarge = errors.New("attachment is too large")

	// ErrAttachmentNotFound is a download for something that is not there, or
	// is in a conversation the caller is not part of.
	ErrAttachmentNotFound = errors.New("attachment not found")

	// ErrAttachmentNotEditable is an edit aimed at a message whose content is a
	// file rather than words.
	ErrAttachmentNotEditable = errors.New("an attachment message cannot be edited")
)

// Attachment is a file on its way into a message, as the handler hands it over.
type Attachment struct {
	// Reader is the uploaded bytes. Storage enforces the size ceiling while
	// reading, so nothing is buffered in memory first.
	Reader io.Reader
	// ContentType is the browser's claim, checked against the allow-list.
	ContentType string
	// OriginalName is what the sender called it. Sanitised before storage.
	OriginalName string
	// DurationSeconds is supplied for voice notes, where the recorder knows the
	// length and the server would otherwise have to decode the file to learn it.
	DurationSeconds *int
}

// ChatService owns the chat rules: who may read a thread, who may change a
// message, and who hears about it.
//
// Every write goes to the database first and is broadcast second. The reverse
// order would let a recipient see a message that failed to save.
type ChatService struct {
	chat       *repository.ChatRepository
	apartments *repository.ApartmentRepository
	users      *repository.UserRepository
	blocks     *repository.BlockRepository
	hub        *realtime.Hub
	files      storage.Storage
	// attachmentURL builds the protected download URL for an attachment id.
	// Injected so the service does not need to know the server's own address.
	attachmentURL func(id uuid.UUID) string
	now           func() time.Time
}

func NewChatService(
	chat *repository.ChatRepository,
	apartments *repository.ApartmentRepository,
	users *repository.UserRepository,
	blocks *repository.BlockRepository,
	hub *realtime.Hub,
	files storage.Storage,
	attachmentURL func(id uuid.UUID) string,
) *ChatService {
	return &ChatService{
		chat: chat, apartments: apartments, users: users, blocks: blocks,
		hub: hub, files: files, attachmentURL: attachmentURL, now: time.Now,
	}
}

// SetClock replaces the service's clock. Tests only.
func (s *ChatService) SetClock(now func() time.Time) { s.now = now }

// StartConversation returns this user's thread with a listing's owner, opening
// it the first time, and makes that listing the thread's current context.
//
// One thread per pair of people, not per listing: writing to the same owner
// about a second apartment continues the conversation already underway rather
// than starting a parallel one. The listing is context, and is recorded on each
// message.
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
// `archived` picks the archive instead of the main list. The two are the same
// query with one predicate flipped, so they cannot disagree about what a thread
// looks like.
func (s *ChatService) ListConversations(
	ctx context.Context, actorID uuid.UUID, archived bool,
) (*dto.ConversationListResponse, error) {
	summaries, err := s.chat.ListConversations(ctx, actorID, archived)
	if err != nil {
		return nil, err
	}

	// Presence is asked once for the whole page rather than per row.
	others := make([]uuid.UUID, 0, len(summaries))
	for _, summary := range summaries {
		others = append(others, summary.OtherUserID)
	}
	online := s.hub.OnlineAmong(others)

	// And so are blocks: one query for the whole list rather than one per row.
	blocked := map[uuid.UUID]repository.BlockState{}
	if s.blocks != nil {
		var err error
		if blocked, err = s.blocks.BlockedEither(ctx, actorID); err != nil {
			return nil, err
		}
	}

	items := make([]dto.ConversationResponse, 0, len(summaries))
	var unreadTotal int64
	// How many threads are waiting, not how many messages: one person who sent
	// thirty is one thread to open.
	var unreadConversations int64
	for _, summary := range summaries {
		item := conversationFrom(summary, online[summary.OtherUserID])
		state := blocked[summary.OtherUserID]
		item.IsBlocked = state.IBlockedThem
		item.IsBlockedBy = state.TheyBlockedMe
		items = append(items, item)
		unreadTotal += summary.UnreadCount
		if summary.UnreadCount > 0 {
			unreadConversations++
		}
	}

	return &dto.ConversationListResponse{
		Items:               items,
		UnreadTotal:         unreadTotal,
		UnreadConversations: unreadConversations,
	}, nil
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
		// The stored URL is a static path; what leaves the server is always the
		// protected endpoint, so an attachment cannot be fetched by anyone who
		// simply learns where it sits on disk.
		s.protect(page.Messages[i].Attachment)
		items = append(items, dto.NewMessageResponse(&page.Messages[i]))
	}

	out := &dto.MessagePageResponse{Items: items, HasMore: page.HasMore}
	// The cursor for the next page is the oldest message on this one.
	if page.HasMore && len(items) > 0 {
		out.NextBefore = items[0].ID.String()
	}

	// Every listing the thread's messages name, so the client can head each run
	// of messages with the listing it is actually about instead of falling back
	// to a placeholder for anything that is not the currently pinned one.
	contexts, err := s.chat.ConversationApartments(ctx, conversationID, actorID)
	if err != nil {
		return nil, err
	}
	out.Apartments = make([]dto.ChatApartmentResponse, 0, len(contexts))
	for _, listing := range contexts {
		out.Apartments = append(out.Apartments, chatApartment(listing))
	}
	return out, nil
}

// derefString reads a nullable column, treating "absent" as "empty".
func derefString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// chatApartment renders a listing the way chat shows it. The nullable columns
// are a listing that has lost its district, price or cover, none of which stops
// the card from naming it.
func chatApartment(listing repository.ApartmentContext) dto.ChatApartmentResponse {
	out := dto.ChatApartmentResponse{ID: listing.ID, Title: listing.Title}
	if listing.District != nil {
		out.District = *listing.District
	}
	if listing.Price != nil {
		out.Price = *listing.Price
	}
	if listing.Currency != nil {
		out.Currency = *listing.Currency
	}
	if listing.RentalPeriod != nil {
		out.RentalPeriod = *listing.RentalPeriod
	}
	if listing.Image != nil {
		out.Image = *listing.Image
	}
	return out
}

// SendMessage stores a message and pushes it to whoever is connected.
//
// `attachment` may be nil, in which case this is a text message. When it is
// present the file is written to storage first: a database row pointing at a
// file that failed to save would render as a broken bubble for both people.
func (s *ChatService) SendMessage(
	ctx context.Context, conversationID, actorID uuid.UUID, body string,
	attachment *Attachment, apartmentID *uuid.UUID, replyTo *uuid.UUID,
) (*dto.MessageResponse, error) {
	if err := s.assertParticipant(ctx, conversationID, actorID); err != nil {
		return nil, err
	}

	// Blocked in either direction: nothing is written, and no realtime event is
	// published, because none is produced. This is the check that matters —
	// the composer being disabled is a courtesy to the person using the app,
	// not a control, and a direct API call has to meet the same refusal.
	blocked, err := s.blockedInConversation(ctx, conversationID, actorID)
	if err != nil {
		return nil, err
	}
	if blocked {
		return nil, ErrBlocked
	}

	body = strings.TrimSpace(body)
	if body == "" && attachment == nil {
		return nil, ErrEmptyMessage
	}

	// The listing this message is about, if the sender was looking at one. It
	// is verified rather than trusted: a client naming a listing that does not
	// exist gets a message with no context, not a broken reference.
	if apartmentID != nil {
		if _, err := s.apartments.FindByID(ctx, *apartmentID); err != nil {
			apartmentID = nil
		}
	}

	// The message being answered. Checked to be in this same thread rather
	// than merely to exist: without that, a reply would be a way to quote a
	// message out of a conversation the sender has no part in, and the quote
	// carries the original's text.
	var quoted *models.Message
	if replyTo != nil {
		original, err := s.chat.FindMessage(ctx, *replyTo)
		if err != nil {
			if errors.Is(err, repository.ErrMessageNotFound) {
				return nil, ErrMessageNotFound
			}
			return nil, err
		}
		if original.ConversationID != conversationID {
			return nil, ErrMessageNotFound
		}
		quoted = original
	}

	message := &models.Message{
		ConversationID:   conversationID,
		SenderID:         actorID,
		Kind:             models.MessageKindText,
		Body:             body,
		ApartmentID:      apartmentID,
		ReplyToMessageID: replyTo,
	}

	var stored *models.MessageAttachment
	if attachment != nil {
		var err error
		stored, err = s.storeAttachment(ctx, attachment)
		if err != nil {
			return nil, err
		}
		message.Kind = stored.Kind
	}

	if apartmentID != nil {
		// The thread's pinned context follows the most recent message that
		// named a listing, so the header shows what is being discussed now.
		if err := s.chat.SetConversationApartment(ctx, conversationID, *apartmentID); err != nil {
			return nil, err
		}
	}

	if err := s.chat.CreateMessage(ctx, message, stored); err != nil {
		// The file is already on disk. Removing it keeps a failed send from
		// leaving bytes nothing will ever reference.
		if stored != nil {
			_ = s.files.Delete(ctx, stored.StoredPath)
		}
		return nil, err
	}

	// The row is written before the URL is known, because the URL is built from
	// the attachment's own id.
	if stored != nil {
		s.protect(stored)
		message.Attachment = stored
	}
	// Already loaded during validation, so the sender's own copy carries the
	// quote without a second read.
	message.ReplyTo = quoted

	response := dto.NewMessageResponse(message)
	// Saved first, announced second: a recipient must never see a message that
	// failed to persist.
	s.broadcast(ctx, conversationID, realtime.EventMessageNew, response)
	return &response, nil
}

// storeAttachment writes an upload to storage and builds its row.
func (s *ChatService) storeAttachment(
	ctx context.Context, attachment *Attachment,
) (*models.MessageAttachment, error) {
	kind, ok := storage.KindForContentType(attachment.ContentType)
	if !ok {
		return nil, ErrUnsupportedAttachment
	}

	saved, err := s.files.SaveKind(ctx, kind, attachment.ContentType, attachment.Reader)
	if err != nil {
		if errors.Is(err, storage.ErrUnsupportedType) {
			return nil, ErrUnsupportedAttachment
		}
		var tooLarge storage.ErrTooLarge
		if errors.As(err, &tooLarge) {
			return nil, ErrAttachmentTooLarge
		}
		return nil, err
	}

	extension, _ := kind.Extension(attachment.ContentType)
	row := &models.MessageAttachment{
		Kind:         kind.Name,
		OriginalName: storage.SafeDisplayName(attachment.OriginalName, extension),
		StoredPath:   saved.Path,
		// Replaced with the protected URL once the row has an id.
		URL:       saved.URL,
		MimeType:  attachment.ContentType,
		SizeBytes: saved.Bytes,
	}
	if kind.Name == storage.KindAudio && attachment.DurationSeconds != nil {
		row.DurationSeconds = attachment.DurationSeconds
	}
	return row, nil
}

// OpenAttachment authorizes a download and returns the file.
//
// Membership is checked before a single byte is read: an attachment is as
// private as the conversation it was sent in, and a URL that anyone could
// fetch would make chat files public to whoever guessed an id.
func (s *ChatService) OpenAttachment(
	ctx context.Context, attachmentID, actorID uuid.UUID,
) (*models.MessageAttachment, io.ReadSeekCloser, error) {
	attachment, conversationID, err := s.chat.FindAttachment(ctx, attachmentID)
	if err != nil {
		if errors.Is(err, repository.ErrMessageNotFound) {
			return nil, nil, ErrAttachmentNotFound
		}
		return nil, nil, err
	}

	if err := s.assertParticipant(ctx, conversationID, actorID); err != nil {
		// A stranger is told it does not exist, not that it exists and is
		// someone else's.
		return nil, nil, ErrAttachmentNotFound
	}

	file, err := s.files.Open(ctx, attachment.StoredPath)
	if err != nil {
		return nil, nil, ErrAttachmentNotFound
	}
	return attachment, file, nil
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
	// An attachment is immutable: editing the caption of a photograph would
	// leave the two people looking at different things, and swapping the file
	// under an existing message is worse. To change it, withdraw it and send
	// another.
	if message.Kind != models.MessageKindText {
		return nil, ErrAttachmentNotEditable
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
		if err := s.chat.SoftDeleteMessage(ctx, messageID, actorID, deletedAt); err != nil {
			return nil, err
		}
		message.DeletedAt = &deletedAt
	}

	response := dto.NewMessageResponse(message)
	s.broadcast(ctx, message.ConversationID, realtime.EventMessageDeleted, response)
	return &response, nil
}

// DeleteMessages removes a selection in one action.
//
// The permission rules are the single-message ones, applied to every id: anyone
// in the thread may hide anything from their own view, and only the author may
// withdraw something from both sides. They are checked before anything is
// written, so a selection is refused whole rather than half-applied — a partial
// delete would leave the person unsure what actually happened.
func (s *ChatService) DeleteMessages(
	ctx context.Context, ids []uuid.UUID, actorID uuid.UUID, scope string,
) (*dto.DeleteMessagesResponse, error) {
	if len(ids) == 0 {
		return &dto.DeleteMessagesResponse{Deleted: []dto.MessageResponse{}}, nil
	}

	// Duplicates in the selection would otherwise be counted twice.
	unique := make([]uuid.UUID, 0, len(ids))
	seen := make(map[uuid.UUID]bool, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			unique = append(unique, id)
		}
	}

	messages, err := s.chat.FindMessages(ctx, unique)
	if err != nil {
		return nil, err
	}
	// An id that matched nothing is an id the caller should not be acting on.
	if len(messages) != len(unique) {
		return nil, ErrMessageNotFound
	}

	// Every message must be in a thread the caller belongs to, and every thread
	// is checked once however many messages the selection holds in it.
	checked := make(map[uuid.UUID]bool, 2)
	for i := range messages {
		message := &messages[i]
		if !checked[message.ConversationID] {
			if err := s.assertParticipant(ctx, message.ConversationID, actorID); err != nil {
				return nil, ErrMessageNotFound
			}
			checked[message.ConversationID] = true
		}
		if scope == dto.DeleteScopeEveryone && message.SenderID != actorID {
			return nil, ErrNotMessageAuthor
		}
	}

	if scope == dto.DeleteScopeMe {
		if err := s.chat.HideMessagesForUser(ctx, unique, actorID); err != nil {
			return nil, err
		}
		// Nothing is broadcast: only this reader's view changed.
		return &dto.DeleteMessagesResponse{
			Deleted: []dto.MessageResponse{},
			Count:   len(unique),
		}, nil
	}

	deletedAt := s.now().UTC()
	if err := s.chat.SoftDeleteMessages(ctx, unique, actorID, deletedAt); err != nil {
		return nil, err
	}

	out := &dto.DeleteMessagesResponse{
		Deleted: make([]dto.MessageResponse, 0, len(messages)),
		Count:   len(unique),
	}
	for i := range messages {
		message := &messages[i]
		// Already withdrawn messages keep the timestamp they had; the rest take
		// this one. Either way the response says "deleted", which is what the
		// caller asked for.
		if message.DeletedAt == nil {
			message.DeletedAt = &deletedAt
		}
		response := dto.NewMessageResponse(message)
		// One event per message, the same event a single delete publishes, so
		// the other side's client needs no special case for a bulk delete.
		s.broadcast(ctx, message.ConversationID, realtime.EventMessageDeleted, response)
		out.Deleted = append(out.Deleted, response)
	}
	return out, nil
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

// UnreadCounts is what the badges read: how many messages are waiting, and how
// many people are waiting. The header shows the second.
func (s *ChatService) UnreadCounts(
	ctx context.Context, actorID uuid.UUID,
) (messages int64, conversations int64, err error) {
	return s.chat.UnreadCounts(ctx, actorID)
}

// ConversationsOf lists the users the given user shares a thread with, so a
// presence change can be announced to the people it matters to rather than
// broadcast to everyone connected.
func (s *ChatService) CounterpartsOf(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	others := []uuid.UUID{}
	// Both lists: an archived thread is still a thread, and its other side
	// still wants to know when this user comes online.
	for _, archived := range []bool{false, true} {
		summaries, err := s.chat.ListConversations(ctx, userID, archived)
		if err != nil {
			return nil, err
		}
		for _, summary := range summaries {
			others = append(others, summary.OtherUserID)
		}
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

// protect rewrites an attachment's URL to the authorized download endpoint.
func (s *ChatService) protect(attachment *models.MessageAttachment) {
	if attachment != nil && s.attachmentURL != nil {
		attachment.URL = s.attachmentURL(attachment.ID)
	}
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

	// Nothing is delivered to someone who has blocked another participant.
	//
	// The send path already refuses a blocked pair, so in practice there is no
	// such event to carry. This is the second lock on the same door: the socket
	// is the one path that reaches a user without their asking, and it should
	// not be the one place the rule is assumed rather than applied.
	audience := participants
	if s.blocks != nil {
		audience = audience[:0:0]
		for _, participant := range participants {
			barred := false
			for _, other := range participants {
				if other == participant {
					continue
				}
				state, err := s.blocks.StateBetween(ctx, participant, other)
				if err != nil {
					// Failing open here would deliver to someone who blocked
					// the sender; failing closed only loses an announcement the
					// next page load recovers.
					barred = true
					break
				}
				if state.Any() {
					barred = true
					break
				}
			}
			if !barred {
				audience = append(audience, participant)
			}
		}
	}
	if len(audience) == 0 {
		return
	}

	s.hub.Publish(audience, realtime.Envelope{
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
	// Both lists: a thread can be described while it sits in the archive, and
	// opening one from there must not report it missing.
	summaries, err := s.chat.ListConversations(ctx, actorID, false)
	if err != nil {
		return nil, err
	}
	archived, err := s.chat.ListConversations(ctx, actorID, true)
	if err != nil {
		return nil, err
	}
	for _, summary := range append(summaries, archived...) {
		if summary.ConversationID != conversationID {
			continue
		}
		response := conversationFrom(summary, s.hub.IsOnline(summary.OtherUserID))
		// The single-thread view needs the block state as much as the list
		// does: this is what the composer reads to know it is disabled.
		if s.blocks != nil {
			state, err := s.blocks.StateBetween(ctx, actorID, summary.OtherUserID)
			if err != nil {
				return nil, err
			}
			response.IsBlocked = state.IBlockedThem
			response.IsBlockedBy = state.TheyBlockedMe
		}
		return &response, nil
	}
	return nil, ErrConversationNotFound
}

// conversationFrom turns a list row into its API shape.
func conversationFrom(summary repository.ConversationSummary, online bool) dto.ConversationResponse {
	out := dto.ConversationResponse{
		ID: summary.ConversationID,
		Other: dto.ChatUserResponse{
			ID:     summary.OtherUserID,
			Name:   strings.TrimSpace(summary.OtherFirstName + " " + summary.OtherLastName),
			Avatar: derefString(summary.OtherAvatarURL),
			Online: online,
		},
		UnreadCount: summary.UnreadCount,
		UpdatedAt:   summary.UpdatedAt,
		IsPinned:    summary.PinnedAt != nil,
		IsArchived:  summary.ArchivedAt != nil,
	}
	// The listing the pair last wrote about, when there still is one.
	//
	// Keyed on the title rather than on the id: `conversations.apartment_id`
	// stays set even when the join found nothing, which is the case for a
	// listing its owner deleted. Building a context from the id alone produced
	// a card with an id and no words in it.
	if summary.ApartmentID != nil && summary.ApartmentTitle != nil {
		out.Apartment = &dto.ChatApartmentResponse{ID: *summary.ApartmentID}
		if summary.ApartmentTitle != nil {
			out.Apartment.Title = *summary.ApartmentTitle
		}
		if summary.ApartmentImage != nil {
			out.Apartment.Image = *summary.ApartmentImage
		}
		if summary.ApartmentDistrict != nil {
			out.Apartment.District = *summary.ApartmentDistrict
		}
		if summary.ApartmentPrice != nil {
			out.Apartment.Price = *summary.ApartmentPrice
		}
		if summary.ApartmentCurrency != nil {
			out.Apartment.Currency = *summary.ApartmentCurrency
		}
		if summary.ApartmentRentalPeriod != nil {
			out.Apartment.RentalPeriod = *summary.ApartmentRentalPeriod
		}
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

// SetPinned pins or unpins a thread for the caller.
//
// Pinning is an opinion one person holds, so it is written to their own
// participant row and nobody else's. The participant check is the same one
// every other chat action runs: a stranger's request is indistinguishable from
// a request about a thread that does not exist.
func (s *ChatService) SetPinned(
	ctx context.Context, conversationID, actorID uuid.UUID, pinned bool,
) error {
	if err := s.assertParticipant(ctx, conversationID, actorID); err != nil {
		return err
	}
	return s.chat.SetPinned(ctx, conversationID, actorID, pinned)
}

// SetArchived moves a thread into or out of the caller's archive.
//
// The history is untouched and the other participant is unaffected: to them the
// thread is still in their main list, and writing to it still works.
func (s *ChatService) SetArchived(
	ctx context.Context, conversationID, actorID uuid.UUID, archived bool,
) error {
	if err := s.assertParticipant(ctx, conversationID, actorID); err != nil {
		return err
	}
	return s.chat.SetArchived(ctx, conversationID, actorID, archived)
}

// DeleteConversation removes a thread for the caller, or for everyone in it.
//
// "For me" hides it from this user only and leaves the other side whole. "For
// everyone" withdraws it from both, which is why the other participant is told
// over the socket — someone with the thread open should not keep typing into
// something that no longer exists.
func (s *ChatService) DeleteConversation(
	ctx context.Context, conversationID, actorID uuid.UUID, forEveryone bool,
) error {
	if err := s.assertParticipant(ctx, conversationID, actorID); err != nil {
		return err
	}

	if !forEveryone {
		return s.chat.DeleteForUser(ctx, conversationID, actorID)
	}

	// Read the audience before the delete: afterwards the thread no longer
	// resolves, and there would be nobody left to tell.
	recipients, err := s.chat.ParticipantIDs(ctx, conversationID)
	if err != nil {
		return err
	}
	if err := s.chat.DeleteForEveryone(ctx, conversationID); err != nil {
		return err
	}

	s.hub.Publish(recipients, realtime.Envelope{
		Event:   realtime.EventConversationDeleted,
		Payload: dto.ConversationDeletedEvent{ConversationID: conversationID.String()},
	})
	return nil
}

// blockedInConversation reports whether the caller is barred from writing in a
// thread, in either direction.
//
// The other participant is read from the conversation rather than taken from
// the request, so there is nothing here a client could aim elsewhere.
func (s *ChatService) blockedInConversation(
	ctx context.Context, conversationID, actorID uuid.UUID,
) (bool, error) {
	if s.blocks == nil {
		return false, nil
	}

	participants, err := s.chat.ParticipantIDs(ctx, conversationID)
	if err != nil {
		return false, err
	}
	for _, participant := range participants {
		if participant == actorID {
			continue
		}
		state, err := s.blocks.StateBetween(ctx, actorID, participant)
		if err != nil {
			return false, err
		}
		if state.Any() {
			return true, nil
		}
	}
	return false, nil
}

// Block records that the caller has blocked another user.
//
// The blocker is always the authenticated caller, so there is no way to spell
// "block on somebody else's behalf". Blocking is idempotent: asking twice is
// the same block, with the reason updated to the more recent statement.
func (s *ChatService) Block(
	ctx context.Context, actorID, targetID uuid.UUID, reason, reasonText *string,
) error {
	if actorID == targetID {
		return ErrCannotBlockSelf
	}
	// Blocking somebody who does not exist is a mistake worth reporting, not a
	// row worth writing. ErrUserNotFound is the auth service's, reused rather
	// than duplicated.
	if _, err := s.users.FindByID(ctx, targetID); err != nil {
		return ErrUserNotFound
	}

	return s.blocks.Block(ctx, &models.UserBlock{
		BlockerID:  actorID,
		BlockedID:  targetID,
		Reason:     reason,
		ReasonText: reasonText,
	})
}

// Unblock lifts the caller's own block. Somebody else's block on the same pair
// is untouched — it is not this caller's to lift.
func (s *ChatService) Unblock(ctx context.Context, actorID, targetID uuid.UUID) error {
	return s.blocks.Unblock(ctx, actorID, targetID)
}

// BlockState reports the caller's standing with another user.
func (s *ChatService) BlockState(
	ctx context.Context, actorID, targetID uuid.UUID,
) (repository.BlockState, error) {
	if actorID == targetID {
		return repository.BlockState{}, nil
	}
	return s.blocks.StateBetween(ctx, actorID, targetID)
}

// ListBlocked returns everyone the caller has blocked, most recent first.
//
// Only their own blocks: somebody who blocked *them* is not on this list, and
// is not theirs to lift.
func (s *ChatService) ListBlocked(
	ctx context.Context, actorID uuid.UUID,
) (*dto.BlockedUserListResponse, error) {
	rows, err := s.blocks.ListBlocked(ctx, actorID)
	if err != nil {
		return nil, err
	}

	items := make([]dto.BlockedUserResponse, 0, len(rows))
	for _, row := range rows {
		item := dto.BlockedUserResponse{
			UserID:     row.UserID.String(),
			Name:       strings.TrimSpace(row.FirstName + " " + row.LastName),
			Reason:     row.Reason,
			ReasonText: row.ReasonText,
			CreatedAt:  row.CreatedAt,
		}
		if row.AvatarURL != nil {
			item.Avatar = *row.AvatarURL
		}
		items = append(items, item)
	}
	return &dto.BlockedUserListResponse{Items: items, Total: len(items)}, nil
}
