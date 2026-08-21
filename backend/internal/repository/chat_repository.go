package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

var (
	// ErrConversationNotFound is returned instead of gorm.ErrRecordNotFound so
	// callers do not have to import GORM to handle a missing row.
	ErrConversationNotFound = errors.New("conversation not found")
	// ErrMessageNotFound is the same for a single message.
	ErrMessageNotFound = errors.New("message not found")
)

// ConversationSummary is one row of the conversation list.
//
// It is assembled by the query rather than by loading each conversation and its
// messages: a list of twenty threads would otherwise be twenty follow-up
// queries for the last message and twenty more for the unread count.
type ConversationSummary struct {
	ConversationID uuid.UUID
	ApartmentID    uuid.UUID
	ApartmentTitle string
	ApartmentImage *string
	OwnerID        uuid.UUID
	BuyerID        uuid.UUID

	OtherUserID    uuid.UUID
	OtherFirstName string
	OtherLastName  string

	LastMessageBody      *string
	LastMessageAt        *time.Time
	LastMessageSenderID  *uuid.UUID
	LastMessageDeletedAt *time.Time

	UnreadCount int64
	UpdatedAt   time.Time
}

// MessagePage is a slice of a thread plus whether more exist behind it.
type MessagePage struct {
	Messages []models.Message
	// HasMore says another page exists older than the oldest returned here, so
	// the client knows whether to keep offering "load earlier".
	HasMore bool
}

// ChatRepository reads and writes conversations and messages. It holds no
// business rules — no membership checks, no status transitions — only queries.
type ChatRepository struct {
	db *gorm.DB
}

func NewChatRepository(db *gorm.DB) *ChatRepository {
	return &ChatRepository{db: db}
}

// FindOrCreateConversation returns the thread between this buyer and this
// apartment, creating it the first time.
//
// The insert leans on the UNIQUE (apartment_id, buyer_id) constraint rather
// than checking first: a check-then-insert has a race window in which two taps
// on "Xabar yozish" both pass the check and produce two threads. The constraint
// has no such window, so the loser simply reads back the winner's row.
func (r *ChatRepository) FindOrCreateConversation(
	ctx context.Context, apartmentID, buyerID, ownerID uuid.UUID,
) (*models.Conversation, error) {
	conversation := &models.Conversation{ApartmentID: apartmentID, BuyerID: buyerID}

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "apartment_id"}, {Name: "buyer_id"}},
			DoNothing: true,
		}).Create(conversation)
		if result.Error != nil {
			return result.Error
		}

		// DoNothing means the row already existed; read it back.
		if result.RowsAffected == 0 {
			if err := tx.First(conversation,
				"apartment_id = ? AND buyer_id = ?", apartmentID, buyerID).Error; err != nil {
				return err
			}
			return nil
		}

		// Membership is what every authorization check reads, so both sides are
		// recorded the moment the thread exists.
		participants := []models.ConversationParticipant{
			{ConversationID: conversation.ID, UserID: buyerID},
			{ConversationID: conversation.ID, UserID: ownerID},
		}
		return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&participants).Error
	})
	if err != nil {
		return nil, fmt.Errorf("find or create conversation: %w", err)
	}
	return conversation, nil
}

// FindConversation loads one thread with its apartment.
func (r *ChatRepository) FindConversation(
	ctx context.Context, id uuid.UUID,
) (*models.Conversation, error) {
	var conversation models.Conversation
	err := r.db.WithContext(ctx).
		Preload("Apartment").
		First(&conversation, "id = ?", id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrConversationNotFound
		}
		return nil, fmt.Errorf("find conversation: %w", err)
	}
	return &conversation, nil
}

// IsParticipant answers the only authorization question chat asks.
func (r *ChatRepository) IsParticipant(
	ctx context.Context, conversationID, userID uuid.UUID,
) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", conversationID, userID).
		Count(&count).Error
	if err != nil {
		return false, fmt.Errorf("check participant: %w", err)
	}
	return count > 0, nil
}

// ParticipantIDs returns everyone in a thread, which is who a realtime event
// has to reach.
func (r *ChatRepository) ParticipantIDs(
	ctx context.Context, conversationID uuid.UUID,
) ([]uuid.UUID, error) {
	var rows []struct{ UserID uuid.UUID }
	err := r.db.WithContext(ctx).
		Model(&models.ConversationParticipant{}).
		Select("user_id").
		Where("conversation_id = ?", conversationID).
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("list participants: %w", err)
	}

	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.UserID)
	}
	return ids, nil
}

// ListConversations returns the user's threads, most recently active first.
//
// One query, with the last message and the unread count folded in as lateral
// subqueries, because the list is rendered whole and N+1 round trips for a
// sidebar is the kind of thing that only shows up once real accounts have real
// histories.
func (r *ChatRepository) ListConversations(
	ctx context.Context, userID uuid.UUID,
) ([]ConversationSummary, error) {
	const query = `
SELECT
    c.id                AS conversation_id,
    c.apartment_id      AS apartment_id,
    a.title             AS apartment_title,
    img.url             AS apartment_image,
    a.owner_id          AS owner_id,
    c.buyer_id          AS buyer_id,
    other.id            AS other_user_id,
    other.first_name    AS other_first_name,
    other.last_name     AS other_last_name,
    last.body           AS last_message_body,
    last.created_at     AS last_message_at,
    last.sender_id      AS last_message_sender_id,
    last.deleted_at     AS last_message_deleted_at,
    COALESCE(unread.count, 0) AS unread_count,
    c.updated_at        AS updated_at
FROM conversations c
JOIN conversation_participants cp
    ON cp.conversation_id = c.id AND cp.user_id = @user_id
JOIN apartments a ON a.id = c.apartment_id
-- The other side of a two-party thread: the owner when I am the buyer, the
-- buyer when I am the owner.
JOIN users other
    ON other.id = CASE WHEN c.buyer_id = @user_id THEN a.owner_id ELSE c.buyer_id END
-- The listing's cover, for the thumbnail beside each thread. Ordered the same
-- way the listing endpoints order a gallery, so the two never disagree.
LEFT JOIN LATERAL (
    SELECT ai.url
    FROM apartment_images ai
    WHERE ai.apartment_id = a.id
    ORDER BY ai.is_primary DESC, ai.sort_order ASC, ai.created_at ASC
    LIMIT 1
) img ON true
LEFT JOIN LATERAL (
    SELECT m.body, m.created_at, m.sender_id, m.deleted_at
    FROM messages m
    WHERE m.conversation_id = c.id
      -- A message this user hid is not their last message.
      AND NOT EXISTS (
          SELECT 1 FROM message_deletions d
          WHERE d.message_id = m.id AND d.user_id = @user_id
      )
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
) last ON true
LEFT JOIN LATERAL (
    SELECT count(*) AS count
    FROM messages m
    WHERE m.conversation_id = c.id
      AND m.sender_id <> @user_id
      AND NOT m.is_read
      AND m.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM message_deletions d
          WHERE d.message_id = m.id AND d.user_id = @user_id
      )
) unread ON true
-- Threads that have never been written in sort by when they were opened.
ORDER BY COALESCE(last.created_at, c.created_at) DESC`

	summaries := []ConversationSummary{}
	err := r.db.WithContext(ctx).Raw(query, map[string]any{"user_id": userID}).Scan(&summaries).Error
	if err != nil {
		return nil, fmt.Errorf("list conversations: %w", err)
	}
	return summaries, nil
}

// ListMessages returns one page of a thread, newest first.
//
// Paging is by cursor rather than offset: a thread gains messages while it is
// being read, and an offset would shift under the reader, repeating or skipping
// one with every new arrival. `before` is the oldest message already held.
func (r *ChatRepository) ListMessages(
	ctx context.Context, conversationID, viewerID uuid.UUID, limit int, before *uuid.UUID,
) (*MessagePage, error) {
	query := r.db.WithContext(ctx).
		Model(&models.Message{}).
		Where("messages.conversation_id = ?", conversationID).
		// Messages this reader hid are invisible to them and to nobody else.
		Where(`NOT EXISTS (
			SELECT 1 FROM message_deletions d
			WHERE d.message_id = messages.id AND d.user_id = ?
		)`, viewerID)

	if before != nil {
		// Compared as a tuple so two messages sharing a timestamp still page
		// deterministically.
		query = query.Where(
			`(messages.created_at, messages.id) < (
				SELECT m.created_at, m.id FROM messages m WHERE m.id = ?
			)`, *before)
	}

	// One extra row answers "is there more" without a second count query.
	// Attachments are preloaded so a page of twenty messages is two queries
	// rather than twenty-one.
	var messages []models.Message
	err := query.
		Preload("Attachment").
		Order("messages.created_at DESC, messages.id DESC").
		Limit(limit + 1).
		Find(&messages).Error
	if err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}

	page := &MessagePage{}
	if len(messages) > limit {
		page.HasMore = true
		messages = messages[:limit]
	}

	// Returned oldest-first, which is the order a thread is rendered in.
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	page.Messages = messages
	return page, nil
}

// CreateMessage stores a message, its attachment if it has one, and marks its
// thread as active.
//
// One transaction: a message whose attachment row failed to insert would render
// as an empty bubble, which is worse than the send having failed outright.
func (r *ChatRepository) CreateMessage(
	ctx context.Context, message *models.Message, attachment *models.MessageAttachment,
) error {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit("Attachment").Create(message).Error; err != nil {
			return err
		}
		if attachment != nil {
			attachment.MessageID = message.ID
			if err := tx.Create(attachment).Error; err != nil {
				return err
			}
			message.Attachment = attachment
		}
		// The conversation list orders by activity, so writing to a thread has
		// to move it.
		return tx.Model(&models.Conversation{}).
			Where("id = ?", message.ConversationID).
			UpdateColumn("updated_at", message.CreatedAt).Error
	})
	if err != nil {
		return fmt.Errorf("create message: %w", err)
	}
	return nil
}

// FindMessage loads one message with its attachment.
func (r *ChatRepository) FindMessage(ctx context.Context, id uuid.UUID) (*models.Message, error) {
	var message models.Message
	if err := r.db.WithContext(ctx).Preload("Attachment").First(&message, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrMessageNotFound
		}
		return nil, fmt.Errorf("find message: %w", err)
	}
	return &message, nil
}

// UpdateMessageBody rewrites a message and stamps it as edited.
func (r *ChatRepository) UpdateMessageBody(
	ctx context.Context, id uuid.UUID, body string, editedAt time.Time,
) error {
	err := r.db.WithContext(ctx).
		Model(&models.Message{}).
		Where("id = ?", id).
		Updates(map[string]any{"body": body, "edited_at": editedAt}).Error
	if err != nil {
		return fmt.Errorf("update message: %w", err)
	}
	return nil
}

// SoftDeleteMessage withdraws a message from both sides.
//
// The body is cleared as well as flagged: a withdrawn message should not sit in
// the database in readable form, and the response would not show it anyway.
// Migration 0004 relaxes the not-blank constraint for exactly this case.
func (r *ChatRepository) SoftDeleteMessage(
	ctx context.Context, id uuid.UUID, deletedAt time.Time,
) error {
	err := r.db.WithContext(ctx).
		Model(&models.Message{}).
		Where("id = ?", id).
		Updates(map[string]any{"deleted_at": deletedAt, "body": ""}).Error
	if err != nil {
		return fmt.Errorf("delete message: %w", err)
	}
	return nil
}

// HideMessageForUser records "delete for me". Repeating it is not an error.
func (r *ChatRepository) HideMessageForUser(
	ctx context.Context, messageID, userID uuid.UUID,
) error {
	deletion := models.MessageDeletion{MessageID: messageID, UserID: userID}
	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&deletion).Error
	if err != nil {
		return fmt.Errorf("hide message: %w", err)
	}
	return nil
}

// MarkRead marks everything the other side sent in this thread as read, and
// returns the ids that actually changed.
//
// The ids are what the realtime event carries: the sender's ticks turn double
// only for the messages that were genuinely unread a moment ago, so re-opening
// a thread does not re-broadcast the whole history.
func (r *ChatRepository) MarkRead(
	ctx context.Context, conversationID, readerID uuid.UUID, readAt time.Time,
) ([]uuid.UUID, error) {
	var rows []struct{ ID uuid.UUID }
	err := r.db.WithContext(ctx).Raw(`
		UPDATE messages
		SET is_read = true, read_at = @read_at
		WHERE conversation_id = @conversation_id
		  AND sender_id <> @reader_id
		  AND NOT is_read
		  AND deleted_at IS NULL
		RETURNING id`,
		map[string]any{
			"conversation_id": conversationID,
			"reader_id":       readerID,
			"read_at":         readAt,
		}).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("mark read: %w", err)
	}

	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	return ids, nil
}

// FindAttachment loads one attachment together with the conversation it belongs
// to, which is what a download has to check before serving any bytes.
func (r *ChatRepository) FindAttachment(
	ctx context.Context, id uuid.UUID,
) (*models.MessageAttachment, uuid.UUID, error) {
	var row struct {
		models.MessageAttachment
		ConversationID uuid.UUID
	}
	err := r.db.WithContext(ctx).
		Model(&models.MessageAttachment{}).
		Select("message_attachments.*, messages.conversation_id").
		Joins("JOIN messages ON messages.id = message_attachments.message_id").
		// A withdrawn message's attachment is no longer readable by anyone.
		Where("message_attachments.id = ? AND messages.deleted_at IS NULL", id).
		Take(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, uuid.Nil, ErrMessageNotFound
		}
		return nil, uuid.Nil, fmt.Errorf("find attachment: %w", err)
	}
	attachment := row.MessageAttachment
	return &attachment, row.ConversationID, nil
}

// UnreadTotal counts everything unread across all of a user's threads, for the
// badge in the header and the sidebar.
func (r *ChatRepository) UnreadTotal(ctx context.Context, userID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.Message{}).
		Joins("JOIN conversation_participants cp ON cp.conversation_id = messages.conversation_id").
		Where("cp.user_id = ?", userID).
		Where("messages.sender_id <> ?", userID).
		Where("NOT messages.is_read").
		Where("messages.deleted_at IS NULL").
		Where(`NOT EXISTS (
			SELECT 1 FROM message_deletions d
			WHERE d.message_id = messages.id AND d.user_id = ?
		)`, userID).
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("count unread: %w", err)
	}
	return count, nil
}
