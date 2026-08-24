package repository

import (
	"context"
	"database/sql"
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
	// The thread's current listing context. All nullable: a conversation
	// outlives the listing it last referred to.
	ApartmentID           *uuid.UUID
	ApartmentTitle        *string
	ApartmentDistrict     *string
	ApartmentPrice        *string
	ApartmentCurrency     *string
	ApartmentRentalPeriod *string
	ApartmentImage        *string

	// The pair.
	OwnerID uuid.UUID
	BuyerID uuid.UUID

	OtherUserID    uuid.UUID
	OtherFirstName string
	OtherLastName  string

	LastMessageBody      *string
	LastMessageAt        *time.Time
	LastMessageSenderID  *uuid.UUID
	LastMessageDeletedAt *time.Time

	UnreadCount int64
	UpdatedAt   time.Time

	// This user's own view of the thread. Nil means they have not pinned or
	// archived it; another participant's row is untouched either way.
	PinnedAt   *time.Time
	ArchivedAt *time.Time
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

// FindOrCreateConversation returns the thread between these two people,
// creating it the first time, and points it at the listing being asked about.
//
// The pair is unordered. `buyerID` is whoever is asking and `ownerID` owns the
// listing they are asking about, but those roles swap the moment the other
// person enquires about one of *their* listings — and it is still the same two
// people, so it is still the same conversation. Both the lookup below and the
// unique index it conflicts against are written over LEAST/GREATEST for that
// reason; matching on the columns in order would hand the pair a second thread
// and show the same person twice in the chat list.
//
// The insert leans on that index rather than checking first: a check-then-insert
// has a race window in which two taps on "Xabar yozish" both pass the check and
// produce two threads. The index has no such window, so the loser simply reads
// back the winner's row.
func (r *ChatRepository) FindOrCreateConversation(
	ctx context.Context, apartmentID, buyerID, ownerID uuid.UUID,
) (*models.Conversation, error) {
	conversation := &models.Conversation{
		BuyerID:     buyerID,
		OwnerID:     ownerID,
		ApartmentID: &apartmentID,
	}

	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// An expression index cannot be named by column list, so the conflict
		// target is written out. GORM passes the expression through untouched.
		result := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "LEAST(buyer_id, owner_id)", Raw: true},
				{Name: "GREATEST(buyer_id, owner_id)", Raw: true},
			},
			DoNothing: true,
		}).Create(conversation)
		if result.Error != nil {
			return result.Error
		}

		// DoNothing means the pair already had a thread; read it back, in
		// whichever order it was originally created.
		if result.RowsAffected == 0 {
			if err := tx.First(conversation,
				"(buyer_id = ? AND owner_id = ?) OR (buyer_id = ? AND owner_id = ?)",
				buyerID, ownerID, ownerID, buyerID).Error; err != nil {
				return err
			}

			// The listing being asked about becomes the thread's current
			// context, so the chat header names what the reader just came from.
			if err := tx.Model(&models.Conversation{}).
				Where("id = ?", conversation.ID).
				UpdateColumn("apartment_id", apartmentID).Error; err != nil {
				return err
			}
			conversation.ApartmentID = &apartmentID

			// Asking to open a thread is asking to see it. Somebody who
			// deleted it for themselves and then pressed "Xabar yozish" is
			// deliberately coming back, so their own row is un-hidden — without
			// this the thread stays out of their list and `describe` cannot
			// find it, and the button reports that the conversation does not
			// exist. The history cutoff is left alone: they asked for the
			// thread back, not for what they cleared.
			if err := tx.Model(&models.ConversationParticipant{}).
				Where("conversation_id = ? AND user_id = ?", conversation.ID, buyerID).
				UpdateColumn("hidden_at", nil).Error; err != nil {
				return err
			}

			// Withdrawn from both sides and now being reopened. The pair cannot
			// get a second row, so this one is revived.
			//
			// The messages are kept. Each participant's history cutoff is moved
			// to now instead, which hides everything said before without
			// destroying it — and matters far more since a conversation became
			// the pair's whole correspondence rather than one listing's thread.
			if conversation.DeletedAt != nil {
				now := time.Now()
				if err := tx.Model(&models.ConversationParticipant{}).
					Where("conversation_id = ?", conversation.ID).
					UpdateColumns(map[string]any{
						"cleared_at":  now,
						"hidden_at":   nil,
						"archived_at": nil,
					}).Error; err != nil {
					return err
				}
				if err := tx.Model(&models.Conversation{}).
					Where("id = ?", conversation.ID).
					UpdateColumn("deleted_at", nil).Error; err != nil {
					return err
				}
				conversation.DeletedAt = nil
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
		// Withdrawn from both sides: it no longer resolves for anybody, which
		// is what stops a stale client reopening it by id.
		First(&conversation, "id = ? AND deleted_at IS NULL", id).Error
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
		Table("conversation_participants AS cp").
		Joins("JOIN conversations AS c ON c.id = cp.conversation_id").
		// Membership of a withdrawn thread is not membership of anything. This
		// is the one check every chat route runs, so excluding it here closes
		// every route at once.
		Where("cp.conversation_id = ? AND cp.user_id = ? AND c.deleted_at IS NULL",
			conversationID, userID).
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
	ctx context.Context, userID uuid.UUID, archived bool,
) ([]ConversationSummary, error) {
	const query = `
SELECT
    c.id                AS conversation_id,
    cp.pinned_at        AS pinned_at,
    cp.archived_at      AS archived_at,
    c.apartment_id      AS apartment_id,
    a.title             AS apartment_title,
    d.name              AS apartment_district,
    a.price             AS apartment_price,
    a.currency          AS apartment_currency,
    a.rental_period     AS apartment_rental_period,
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
-- The thread's current listing context. LEFT, because a conversation outlives
-- the listing it last referred to — the pair keep talking, and the header
-- simply has nothing to pin.
LEFT JOIN apartments a ON a.id = c.apartment_id
LEFT JOIN districts d ON d.id = a.district_id
-- The other side of the pair. Read from the conversation itself now rather than
-- through the listing, so who this thread is with does not depend on a listing
-- still existing.
JOIN users other
    ON other.id = CASE WHEN c.buyer_id = @user_id THEN c.owner_id ELSE c.buyer_id END
-- The context listing's cover, for the thumbnail beside each thread. Ordered
-- the same way the listing endpoints order a gallery, so the two never
-- disagree.
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
      -- Everything before this user deleted the thread is no longer theirs to
      -- read, so it is not their last message either.
      AND (cp.cleared_at IS NULL OR m.created_at > cp.cleared_at)
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
      AND (cp.cleared_at IS NULL OR m.created_at > cp.cleared_at)
      AND m.sender_id <> @user_id
      AND NOT m.is_read
      AND m.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM message_deletions d
          WHERE d.message_id = m.id AND d.user_id = @user_id
      )
) unread ON true
WHERE
    -- Withdrawn from both sides: gone for everyone, enforced here rather than
    -- left to the client to hide.
    c.deleted_at IS NULL
    -- Deleted by this user, and nothing has been said since. A later message
    -- brings the thread back, carrying only what arrived after the deletion.
    AND (cp.hidden_at IS NULL OR last.created_at IS NOT NULL)
    -- One list or the other, never both.
    AND (CASE WHEN @archived THEN cp.archived_at IS NOT NULL ELSE cp.archived_at IS NULL END)
-- Pinned first, most recently pinned at the top of that group; everything else
-- by activity. Threads never written in sort by when they were opened.
ORDER BY
    cp.pinned_at DESC NULLS LAST,
    COALESCE(last.created_at, c.created_at) DESC`

	summaries := []ConversationSummary{}
	err := r.db.WithContext(ctx).
		Raw(query, map[string]any{"user_id": userID, "archived": archived}).
		Scan(&summaries).Error
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
		// A thread this reader deleted starts again from that moment: what was
		// said before is no longer theirs to read, even though the other side
		// still has all of it.
		Where(`NOT EXISTS (
			SELECT 1 FROM conversation_participants cp
			WHERE cp.conversation_id = messages.conversation_id
			  AND cp.user_id = ?
			  AND cp.cleared_at IS NOT NULL
			  AND messages.created_at <= cp.cleared_at
		)`, viewerID).
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

// ApartmentContext is a listing as a message names it: enough to render the
// card that introduces a run of messages, and nothing more.
type ApartmentContext struct {
	ID           uuid.UUID
	Title        string
	District     *string
	Price        *string
	Currency     *string
	RentalPeriod *string
	Image        *string
}

// ConversationApartments returns every listing this reader's messages in the
// thread refer to.
//
// A conversation belongs to two people and can range over several listings, so
// the client needs details for all of them, not only the one currently pinned —
// otherwise a message about an earlier listing has nothing to show but a
// placeholder. Returned for the whole thread rather than per page, so paging
// backwards never lands on a message whose listing is unknown.
//
// The visibility rules are the same two ListMessages applies, so a listing
// cannot be learned from a message the reader is not allowed to see.
func (r *ChatRepository) ConversationApartments(
	ctx context.Context, conversationID, viewerID uuid.UUID,
) ([]ApartmentContext, error) {
	var out []ApartmentContext
	err := r.db.WithContext(ctx).Raw(`
		SELECT DISTINCT ON (a.id)
		    a.id            AS id,
		    a.title         AS title,
		    d.name          AS district,
		    a.price         AS price,
		    a.currency      AS currency,
		    a.rental_period AS rental_period,
		    img.url         AS image
		FROM messages m
		JOIN apartments a ON a.id = m.apartment_id
		LEFT JOIN districts d ON d.id = a.district_id
		-- The cover, ordered the way every other endpoint orders a gallery.
		LEFT JOIN LATERAL (
		    SELECT ai.url
		    FROM apartment_images ai
		    WHERE ai.apartment_id = a.id
		    ORDER BY ai.is_primary DESC, ai.sort_order ASC, ai.created_at ASC
		    LIMIT 1
		) img ON true
		WHERE m.conversation_id = @conversation_id
		  AND m.apartment_id IS NOT NULL
		  AND NOT EXISTS (
		      SELECT 1 FROM conversation_participants cp
		      WHERE cp.conversation_id = m.conversation_id
		        AND cp.user_id = @viewer_id
		        AND cp.cleared_at IS NOT NULL
		        AND m.created_at <= cp.cleared_at
		  )
		  AND NOT EXISTS (
		      SELECT 1 FROM message_deletions md
		      WHERE md.message_id = m.id AND md.user_id = @viewer_id
		  )
	`, sql.Named("conversation_id", conversationID), sql.Named("viewer_id", viewerID)).
		Scan(&out).Error
	if err != nil {
		return nil, fmt.Errorf("conversation apartments: %w", err)
	}
	return out, nil
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

// UnreadCounts answers two different questions about the same messages.
//
// `messages` is how many are waiting; `conversations` is how many people are
// waiting. The header badge wants the second: somebody who sent thirty messages
// is still one person to reply to, and a badge reading 450 says nothing a
// reader can act on.
//
// Both come from one query, so the two figures cannot disagree about which
// messages they are describing.
//
// Archived threads are excluded, matching the list: a badge that counts what
// the inbox does not show points at nothing the reader can open.
func (r *ChatRepository) UnreadCounts(
	ctx context.Context, userID uuid.UUID,
) (messages int64, conversations int64, err error) {
	var row struct {
		Messages      int64
		Conversations int64
	}

	err = r.db.WithContext(ctx).
		Model(&models.Message{}).
		Select("COUNT(*) AS messages, COUNT(DISTINCT messages.conversation_id) AS conversations").
		Joins("JOIN conversation_participants cp ON cp.conversation_id = messages.conversation_id").
		Joins("JOIN conversations c ON c.id = messages.conversation_id").
		Where("cp.user_id = ?", userID).
		// The badge counts what the user can actually open: not a withdrawn
		// thread, not one they filed away, and not messages from before they
		// deleted it themselves.
		Where("c.deleted_at IS NULL").
		Where("cp.archived_at IS NULL").
		Where("cp.hidden_at IS NULL OR messages.created_at > cp.hidden_at").
		Where("cp.cleared_at IS NULL OR messages.created_at > cp.cleared_at").
		Where("messages.sender_id <> ?", userID).
		Where("NOT messages.is_read").
		Where("messages.deleted_at IS NULL").
		Where(`NOT EXISTS (
			SELECT 1 FROM message_deletions d
			WHERE d.message_id = messages.id AND d.user_id = ?
		)`, userID).
		Scan(&row).Error
	if err != nil {
		return 0, 0, fmt.Errorf("count unread: %w", err)
	}
	return row.Messages, row.Conversations, nil
}

// SetPinned pins or unpins a thread for one person.
//
// The WHERE names both the conversation and the user, so the statement can only
// ever touch the caller's own row — there is no way to spell "somebody else's
// pin" with it, whatever the caller sends.
func (r *ChatRepository) SetPinned(
	ctx context.Context, conversationID, userID uuid.UUID, pinned bool,
) error {
	var value any
	if pinned {
		value = time.Now()
	}
	err := r.db.WithContext(ctx).
		Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", conversationID, userID).
		UpdateColumn("pinned_at", value).Error
	if err != nil {
		return fmt.Errorf("set pinned: %w", err)
	}
	return nil
}

// SetArchived moves a thread into or out of one person's archive.
//
// Archiving does not touch the messages: the thread keeps its history and the
// other participant keeps seeing it in their main list.
func (r *ChatRepository) SetArchived(
	ctx context.Context, conversationID, userID uuid.UUID, archived bool,
) error {
	var value any
	if archived {
		value = time.Now()
	}
	err := r.db.WithContext(ctx).
		Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", conversationID, userID).
		UpdateColumn("archived_at", value).Error
	if err != nil {
		return fmt.Errorf("set archived: %w", err)
	}
	return nil
}

// DeleteForUser hides a thread from one person, from now on.
//
// A cutoff rather than a flag: everything already said stops being theirs to
// read, and a message arriving later brings the thread back carrying only what
// came after. That is what makes this survivable — the other participant can
// still write, and their message is not swallowed by a thread that no longer
// exists on one side.
//
// Un-archiving at the same time is deliberate: a revived thread belongs in the
// main list, not in an archive the user has probably forgotten.
func (r *ChatRepository) DeleteForUser(
	ctx context.Context, conversationID, userID uuid.UUID,
) error {
	now := time.Now()
	err := r.db.WithContext(ctx).
		Model(&models.ConversationParticipant{}).
		Where("conversation_id = ? AND user_id = ?", conversationID, userID).
		UpdateColumns(map[string]any{"hidden_at": now, "cleared_at": now, "archived_at": nil}).Error
	if err != nil {
		return fmt.Errorf("delete conversation for user: %w", err)
	}
	return nil
}

// DeleteForEveryone withdraws a thread from both sides.
//
// Soft, and on the conversation rather than on either participant: it is a fact
// about the thread, so every read excludes it for everybody without either
// client being asked to cooperate.
func (r *ChatRepository) DeleteForEveryone(ctx context.Context, conversationID uuid.UUID) error {
	err := r.db.WithContext(ctx).
		Model(&models.Conversation{}).
		Where("id = ? AND deleted_at IS NULL", conversationID).
		UpdateColumn("deleted_at", time.Now()).Error
	if err != nil {
		return fmt.Errorf("delete conversation for everyone: %w", err)
	}
	return nil
}

// SetConversationApartment moves a thread's pinned context to a listing.
//
// The context follows the most recent message that named one, so the header
// shows what the pair are discussing now rather than what they discussed first.
func (r *ChatRepository) SetConversationApartment(
	ctx context.Context, conversationID, apartmentID uuid.UUID,
) error {
	err := r.db.WithContext(ctx).
		Model(&models.Conversation{}).
		Where("id = ?", conversationID).
		UpdateColumn("apartment_id", apartmentID).Error
	if err != nil {
		return fmt.Errorf("set conversation apartment: %w", err)
	}
	return nil
}
