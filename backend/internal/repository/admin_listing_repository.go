package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// ErrListingNotFound is returned instead of gorm.ErrRecordNotFound.
var ErrListingNotFound = errors.New("listing not found")

// AdminListingRepository reads listings for the dashboard.
//
// Read-only: an administrator inspects listings here, and the owner's own
// endpoints remain the only way to change one. Nothing in this file writes.
type AdminListingRepository struct {
	db *gorm.DB
}

func NewAdminListingRepository(db *gorm.DB) *AdminListingRepository {
	return &AdminListingRepository{db: db}
}

// AdminListingRow is one line of the listings table.
type AdminListingRow struct {
	ID         uuid.UUID       `gorm:"column:id"`
	Title      string          `gorm:"column:title"`
	Price      decimal.Decimal `gorm:"column:price"`
	Currency   string          `gorm:"column:currency"`
	Status     string          `gorm:"column:status"`
	Rooms      int             `gorm:"column:rooms"`
	Area       int32           `gorm:"column:area"`
	Floor      int             `gorm:"column:floor"`
	ViewsCount int64           `gorm:"column:views_count"`
	CreatedAt  time.Time       `gorm:"column:created_at"`
	District   string          `gorm:"column:district"`
	OwnerName  string          `gorm:"column:owner_name"`
	// The picture the table shows. Null for a listing with no photographs.
	CoverURL *string `gorm:"column:cover_url"`
}

// ListingQuery filters the table.
type ListingQuery struct {
	Status string
	Search string
	Page   int
	Limit  int
}

// List returns one page of listings and how many match.
//
// The cover is chosen the same way the marketplace chooses it — the primary
// image, or the first by sort order — so the administrator sees the same
// picture a visitor would.
func (r *AdminListingRepository) List(
	ctx context.Context, query ListingQuery,
) ([]AdminListingRow, int64, error) {
	base := r.db.WithContext(ctx).
		Table("apartments AS a").
		Joins("JOIN users AS u ON u.id = a.owner_id").
		Joins("LEFT JOIN districts AS d ON d.id = a.district_id")

	if query.Status != "" {
		base = base.Where("a.status = ?", query.Status)
	} else {
		// The default view is every listing that still exists. A deleted one is
		// only reached by asking for it, which is what the sidebar entry does.
		base = base.Where("a.status <> ?", models.ApartmentStatusDeleted)
	}
	if search := strings.TrimSpace(query.Search); search != "" {
		pattern := "%" + strings.ToLower(search) + "%"
		base = base.Where(
			"a.title ILIKE ? OR a.address ILIKE ? OR u.first_name ILIKE ? OR u.last_name ILIKE ?",
			pattern, pattern, pattern, pattern,
		)
	}

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count listings: %w", err)
	}

	limit := query.Limit
	if limit <= 0 {
		limit = 10
	}
	page := query.Page
	if page <= 0 {
		page = 1
	}

	var rows []AdminListingRow
	err := base.
		Select(`a.id, a.title, a.price, a.currency, a.status, a.rooms, a.area, a.floor,
			a.views_count, a.created_at,
			COALESCE(d.name, '') AS district,
			btrim(u.first_name || ' ' || u.last_name) AS owner_name,
			(SELECT i.url FROM apartment_images i
			  WHERE i.apartment_id = a.id
			  ORDER BY i.is_primary DESC, i.sort_order, i.created_at
			  LIMIT 1) AS cover_url`).
		Order("a.created_at DESC").
		Limit(limit).
		Offset((page - 1) * limit).
		Scan(&rows).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list listings: %w", err)
	}
	return rows, total, nil
}

// AdminListingDetail is everything the detail card shows.
type AdminListingDetail struct {
	AdminListingRow
	Address     string  `gorm:"column:address"`
	Description string  `gorm:"column:description"`
	TotalFloors int     `gorm:"column:total_floors"`
	Furnished   bool    `gorm:"column:furnished"`
	OwnerID     string  `gorm:"column:owner_id"`
	OwnerEmail  *string `gorm:"column:owner_email"`
	OwnerPhone  *string `gorm:"column:owner_phone"`
	OwnerAvatar *string `gorm:"column:owner_avatar"`
}

// Detail loads one listing with its owner.
func (r *AdminListingRepository) Detail(
	ctx context.Context, id uuid.UUID,
) (*AdminListingDetail, error) {
	var row AdminListingDetail
	err := r.db.WithContext(ctx).
		Table("apartments AS a").
		Joins("JOIN users AS u ON u.id = a.owner_id").
		Joins("LEFT JOIN districts AS d ON d.id = a.district_id").
		Where("a.id = ?", id).
		Select(`a.id, a.title, a.price, a.currency, a.status, a.rooms, a.area, a.floor,
			a.total_floors, a.furnished, a.views_count, a.created_at, a.address,
			COALESCE(a.description, '') AS description,
			COALESCE(d.name, '') AS district,
			a.owner_id,
			btrim(u.first_name || ' ' || u.last_name) AS owner_name,
			u.email AS owner_email, u.phone AS owner_phone, u.avatar_url AS owner_avatar,
			(SELECT i.url FROM apartment_images i
			  WHERE i.apartment_id = a.id
			  ORDER BY i.is_primary DESC, i.sort_order, i.created_at
			  LIMIT 1) AS cover_url`).
		Scan(&row).Error
	if err != nil {
		return nil, fmt.Errorf("listing detail: %w", err)
	}
	if row.ID == uuid.Nil {
		return nil, ErrListingNotFound
	}
	return &row, nil
}

// Images returns every photograph of a listing, in the order it is shown.
func (r *AdminListingRepository) Images(ctx context.Context, id uuid.UUID) ([]string, error) {
	var urls []string
	err := r.db.WithContext(ctx).
		Table("apartment_images").
		Where("apartment_id = ?", id).
		Order("is_primary DESC, sort_order, created_at").
		Pluck("url", &urls).Error
	if err != nil {
		return nil, fmt.Errorf("listing images: %w", err)
	}
	return urls, nil
}

// ListingStats is what the dashboard reports about one listing.
type ListingStats struct {
	Views    int64 `gorm:"column:views"    json:"views"`
	Saves    int64 `gorm:"column:saves"    json:"saves"`
	Contacts int64 `gorm:"column:contacts" json:"contacts"`
	Chats    int64 `gorm:"column:chats"    json:"chats"`
}

// Stats counts what happened to one listing.
//
// Every figure is scoped to this listing, so two listings owned by the same
// person never share a number.
//
//   - views    — the counter the marketplace maintains as people open it.
//   - saves    — how many people have it in their wishlist.
//   - contacts — enquiries: messages about this listing written by somebody
//     other than its owner. This is the closest thing the database has to a
//     "contact", there being no separate request model.
//   - chats    — how many separate conversations those enquiries happened in.
//     Fewer than contacts whenever somebody wrote more than once.
func (r *AdminListingRepository) Stats(
	ctx context.Context, id, ownerID uuid.UUID,
) (*ListingStats, error) {
	var stats ListingStats
	err := r.db.WithContext(ctx).Raw(`
		SELECT
			(SELECT COALESCE(views_count, 0) FROM apartments WHERE id = ?)        AS views,
			(SELECT count(*) FROM favorites WHERE apartment_id = ?)               AS saves,
			(SELECT count(*) FROM messages
			  WHERE apartment_id = ? AND sender_id <> ? AND deleted_at IS NULL)   AS contacts,
			(SELECT count(DISTINCT conversation_id) FROM messages
			  WHERE apartment_id = ? AND deleted_at IS NULL)                      AS chats
	`, id, id, id, ownerID, id).Scan(&stats).Error
	if err != nil {
		return nil, fmt.Errorf("listing stats: %w", err)
	}
	return &stats, nil
}

// ChatPreview is one conversation about a listing, as an administrator reads it.
type ChatPreview struct {
	ConversationID uuid.UUID `gorm:"column:conversation_id"`
	UserID         uuid.UUID `gorm:"column:user_id"`
	UserName       string    `gorm:"column:user_name"`
	UserAvatar     *string   `gorm:"column:user_avatar"`
	LastMessage    string    `gorm:"column:last_message"`
	LastMessageAt  time.Time `gorm:"column:last_message_at"`
	Unread         int64     `gorm:"column:unread"`
}

// Chats returns the conversations held about one listing.
//
// Scoped by `messages.apartment_id`, which is the listing a message was written
// about. Conversations are per pair of people rather than per listing, so two
// listings between the same two people share a conversation — filtering on the
// conversation would mix them, and filtering on the message does not.
//
// The other party is whoever is not the listing's owner.
func (r *AdminListingRepository) Chats(
	ctx context.Context, id, ownerID uuid.UUID,
) ([]ChatPreview, error) {
	var rows []ChatPreview
	err := r.db.WithContext(ctx).Raw(`
		WITH listing_messages AS (
			SELECT m.*,
			       ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at DESC) AS rn
			FROM messages m
			WHERE m.apartment_id = ? AND m.deleted_at IS NULL
		)
		SELECT
			lm.conversation_id,
			other.id            AS user_id,
			btrim(other.first_name || ' ' || other.last_name) AS user_name,
			other.avatar_url    AS user_avatar,
			lm.body             AS last_message,
			lm.created_at       AS last_message_at,
			(SELECT count(*) FROM listing_messages u
			  WHERE u.conversation_id = lm.conversation_id
			    AND u.sender_id <> ? AND u.is_read = false) AS unread
		FROM listing_messages lm
		JOIN conversations c ON c.id = lm.conversation_id
		JOIN users other ON other.id = CASE WHEN c.buyer_id = ? THEN c.owner_id ELSE c.buyer_id END
		WHERE lm.rn = 1
		ORDER BY lm.created_at DESC
	`, id, ownerID, ownerID).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("listing chats: %w", err)
	}
	return rows, nil
}

// OwnerConversation is one thread between a listing owner and somebody who
// wrote to them.
type OwnerConversation struct {
	ConversationID uuid.UUID `gorm:"column:conversation_id"`
	UserID         uuid.UUID `gorm:"column:user_id"`
	UserName       string    `gorm:"column:user_name"`
	UserAvatar     *string   `gorm:"column:user_avatar"`
	LastMessageAt  time.Time `gorm:"column:last_message_at"`
	MessageCount   int64     `gorm:"column:message_count"`
}

// OwnerMessage is one message inside such a thread, as moderation reads it.
type OwnerMessage struct {
	ID             uuid.UUID  `gorm:"column:id"`
	ConversationID uuid.UUID  `gorm:"column:conversation_id"`
	SenderID       uuid.UUID  `gorm:"column:sender_id"`
	SenderName     string     `gorm:"column:sender_name"`
	Body           string     `gorm:"column:body"`
	Kind           string     `gorm:"column:kind"`
	CreatedAt      time.Time  `gorm:"column:created_at"`
	EditedAt       *time.Time `gorm:"column:edited_at"`
	DeletedAt      *time.Time `gorm:"column:deleted_at"`
	// Null when the message stands, and null for one withdrawn before the
	// column existed — the audit view says so rather than naming nobody.
	DeletedByName *string `gorm:"column:deleted_by_name"`
	ListingTitle  *string `gorm:"column:listing_title"`
}

// OwnerConversations lists every thread held about any of one person's
// listings, busiest end first.
//
// Scoped through `messages.apartment_id`: conversations are per pair of people,
// so the same thread can carry messages about several listings and about none.
// Asking which conversations contain a message about one of this owner's
// listings is the question that matches how the data is actually shaped.
func (r *AdminListingRepository) OwnerConversations(
	ctx context.Context, ownerID uuid.UUID,
) ([]OwnerConversation, error) {
	var rows []OwnerConversation
	err := r.db.WithContext(ctx).Raw(`
		SELECT
			c.id AS conversation_id,
			other.id AS user_id,
			btrim(other.first_name || ' ' || other.last_name) AS user_name,
			other.avatar_url AS user_avatar,
			MAX(m.created_at) AS last_message_at,
			COUNT(m.id) AS message_count
		FROM conversations c
		JOIN users other
		  ON other.id = CASE WHEN c.buyer_id = ? THEN c.owner_id ELSE c.buyer_id END
		JOIN messages m ON m.conversation_id = c.id
		WHERE (c.buyer_id = ? OR c.owner_id = ?)
		  AND EXISTS (
		        SELECT 1 FROM messages lm
		        JOIN apartments a ON a.id = lm.apartment_id
		        WHERE lm.conversation_id = c.id AND a.owner_id = ?
		  )
		GROUP BY c.id, other.id, other.first_name, other.last_name, other.avatar_url
		ORDER BY MAX(m.created_at) DESC
	`, ownerID, ownerID, ownerID, ownerID).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("owner conversations: %w", err)
	}
	return rows, nil
}

// OwnerMessages loads every message of the given conversations.
//
// One query for all of them rather than one per thread: the dashboard shows
// them one at a time but fetches them together, so moving between threads is
// instant and the server is asked once.
//
// Withdrawn messages come back with their text. That is the whole point of the
// endpoint — and why it is refused to anybody but the owner.
func (r *AdminListingRepository) OwnerMessages(
	ctx context.Context, conversationIDs []uuid.UUID,
) ([]OwnerMessage, error) {
	if len(conversationIDs) == 0 {
		return nil, nil
	}

	var rows []OwnerMessage
	err := r.db.WithContext(ctx).Raw(`
		SELECT
			m.id, m.conversation_id, m.sender_id,
			btrim(s.first_name || ' ' || s.last_name) AS sender_name,
			m.body, m.kind, m.created_at, m.edited_at, m.deleted_at,
			CASE WHEN d.id IS NULL THEN NULL
			     ELSE btrim(d.first_name || ' ' || d.last_name) END AS deleted_by_name,
			a.title AS listing_title
		FROM messages m
		JOIN users s ON s.id = m.sender_id
		LEFT JOIN users d ON d.id = m.deleted_by
		LEFT JOIN apartments a ON a.id = m.apartment_id
		WHERE m.conversation_id IN ?
		ORDER BY m.created_at
	`, conversationIDs).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("owner messages: %w", err)
	}
	return rows, nil
}

// ListingOwnerID returns who published a listing, for scoping the audit view.
func (r *AdminListingRepository) ListingOwnerID(
	ctx context.Context, listingID uuid.UUID,
) (uuid.UUID, error) {
	// Read as text and parsed here: the driver hands a uuid column back as a
	// string, and scanning it straight into uuid.UUID asks it to fill a
	// [16]byte with 36 characters.
	var raw string
	err := r.db.WithContext(ctx).
		Table("apartments").
		Where("id = ?", listingID).
		Pluck("owner_id::text", &raw).Error
	if err != nil {
		return uuid.Nil, fmt.Errorf("listing owner: %w", err)
	}
	if raw == "" {
		return uuid.Nil, ErrListingNotFound
	}
	ownerID, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, fmt.Errorf("listing owner: %w", err)
	}
	return ownerID, nil
}

// AdminChatRow is one conversation as the moderation table lists it.
type AdminChatRow struct {
	ID            uuid.UUID  `gorm:"column:id"`
	BuyerName     string     `gorm:"column:buyer_name"`
	SellerName    string     `gorm:"column:seller_name"`
	ListingTitle  *string    `gorm:"column:listing_title"`
	LastMessage   string     `gorm:"column:last_message"`
	LastMessageAt *time.Time `gorm:"column:last_message_at"`
	LastDeleted   *time.Time `gorm:"column:last_deleted"`
	Messages      int64      `gorm:"column:messages"`
	DeletedAt     *time.Time `gorm:"column:deleted_at"`
}

// AllChats lists conversations across the marketplace, busiest end first.
//
// Every thread, including ones a participant has removed from their own view:
// this is the moderation table, and a conversation somebody deleted is exactly
// the one an administrator may need to look at.
func (r *AdminListingRepository) AllChats(
	ctx context.Context, search string, page, limit int,
) ([]AdminChatRow, int64, error) {
	base := r.db.WithContext(ctx).
		Table("conversations AS c").
		Joins("JOIN users AS b ON b.id = c.buyer_id").
		Joins("JOIN users AS s ON s.id = c.owner_id")

	if term := strings.TrimSpace(search); term != "" {
		pattern := "%" + strings.ToLower(term) + "%"
		base = base.Where(
			`b.first_name ILIKE ? OR b.last_name ILIKE ?
			 OR s.first_name ILIKE ? OR s.last_name ILIKE ?`,
			pattern, pattern, pattern, pattern,
		)
	}

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count chats: %w", err)
	}

	if limit <= 0 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}

	var rows []AdminChatRow
	err := base.
		Select(`c.id, c.deleted_at,
			btrim(b.first_name || ' ' || b.last_name) AS buyer_name,
			btrim(s.first_name || ' ' || s.last_name) AS seller_name,
			(SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) AS messages,
			last.body       AS last_message,
			last.created_at AS last_message_at,
			last.deleted_at AS last_deleted,
			(SELECT a.title FROM messages m
			   JOIN apartments a ON a.id = m.apartment_id
			   WHERE m.conversation_id = c.id
			   ORDER BY m.created_at DESC LIMIT 1) AS listing_title`).
		Joins(`LEFT JOIN LATERAL (
			SELECT body, created_at, deleted_at FROM messages m
			WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
		) last ON true`).
		Order("last.created_at DESC NULLS LAST").
		Limit(limit).
		Offset((page - 1) * limit).
		Scan(&rows).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list chats: %w", err)
	}
	return rows, total, nil
}

// ChatParticipants names the two people in a conversation, for the preview
// header.
func (r *AdminListingRepository) ChatParticipants(
	ctx context.Context, id uuid.UUID,
) (buyer, seller string, err error) {
	var row struct {
		Buyer  string `gorm:"column:buyer_name"`
		Seller string `gorm:"column:seller_name"`
	}
	err = r.db.WithContext(ctx).
		Table("conversations AS c").
		Joins("JOIN users AS b ON b.id = c.buyer_id").
		Joins("JOIN users AS s ON s.id = c.owner_id").
		Where("c.id = ?", id).
		Select(`btrim(b.first_name || ' ' || b.last_name) AS buyer_name,
			btrim(s.first_name || ' ' || s.last_name) AS seller_name`).
		Scan(&row).Error
	if err != nil {
		return "", "", fmt.Errorf("chat participants: %w", err)
	}
	if row.Buyer == "" && row.Seller == "" {
		return "", "", ErrConversationNotFound
	}
	return row.Buyer, row.Seller, nil
}
