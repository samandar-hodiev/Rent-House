package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
)

// ErrListingNotFound is returned when no such listing exists.
var ErrListingNotFound = errors.New("listing not found")

// maxListingPageSize caps what a caller may ask for.
const maxListingPageSize = 100

// AdminListingService reads listings for the dashboard and decides who may see
// what about them.
type AdminListingService struct {
	listings *repository.AdminListingRepository
	// The owner's own repository, reused for writes: moderation changes the
	// same column an owner changes, and a second way to write it would be a
	// second set of rules to keep in step.
	apartments *repository.ApartmentRepository
	// The page size the owner configured. Optional: nil falls back to the
	// declared default.
	settings *SettingsService
}

func NewAdminListingService(
	listings *repository.AdminListingRepository, apartments *repository.ApartmentRepository,
	settings *SettingsService,
) *AdminListingService {
	return &AdminListingService{listings: listings, apartments: apartments, settings: settings}
}

// SetStatus moves a listing between states, as moderation.
//
// The transitions are the owner's own — `allowedTransition` — so an
// administrator cannot put a listing into a state its owner could never reach,
// and the two never disagree about what a state means. What differs is the
// authority: there is no ownership check, because moderating somebody else's
// listing is the entire point.
//
// Publishing stamps a date and unpublishing clears it, exactly as the owner's
// path does: `ck_apartments_published_at` requires a date precisely when a
// listing is active.
func (s *AdminListingService) SetStatus(
	ctx context.Context, actor *models.Admin, id uuid.UUID, target string,
) error {
	if !isKnownListingStatus(target) {
		return ErrInvalidAdminStatus
	}

	current, err := s.apartments.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return ErrListingNotFound
		}
		return err
	}

	if !allowedTransition(current.Status, target) {
		return ErrInvalidStatusChange
	}

	fields := map[string]any{"status": target}
	if target == models.ApartmentStatusActive {
		fields["published_at"] = time.Now().UTC()
	} else {
		fields["published_at"] = nil
	}

	if err := s.apartments.UpdateFields(ctx, id, fields); err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return ErrListingNotFound
		}
		return err
	}
	return nil
}

// ListingPage is one page of the listings table.
type ListingPage struct {
	Listings []repository.AdminListingRow
	Total    int64
	Page     int
	Limit    int
}

// List returns one page of listings.
func (s *AdminListingService) List(
	ctx context.Context, status, search string, page, limit int,
) (*ListingPage, error) {
	if status != "" && !isKnownListingStatus(status) {
		return nil, ErrInvalidAdminStatus
	}
	if page < 1 {
		page = 1
	}
	switch {
	case limit < 1:
		limit = s.pageSize(ctx)
	case limit > maxListingPageSize:
		limit = maxListingPageSize
	}

	rows, total, err := s.listings.List(ctx, repository.ListingQuery{
		Status: status, Search: search, Page: page, Limit: limit,
	})
	if err != nil {
		return nil, err
	}
	return &ListingPage{Listings: rows, Total: total, Page: page, Limit: limit}, nil
}

// ListingDetail is one listing with everything the card shows.
type ListingDetail struct {
	Listing *repository.AdminListingDetail
	Images  []string
	Stats   *repository.ListingStats
}

// Detail loads a listing, its photographs and its figures.
func (s *AdminListingService) Detail(
	ctx context.Context, id uuid.UUID,
) (*ListingDetail, error) {
	listing, err := s.listings.Detail(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrListingNotFound) {
			return nil, ErrListingNotFound
		}
		return nil, err
	}

	ownerID, err := uuid.Parse(listing.OwnerID)
	if err != nil {
		return nil, fmt.Errorf("listing detail: bad owner id: %w", err)
	}

	images, err := s.listings.Images(ctx, id)
	if err != nil {
		return nil, err
	}
	stats, err := s.listings.Stats(ctx, id, ownerID)
	if err != nil {
		return nil, err
	}
	return &ListingDetail{Listing: listing, Images: images, Stats: stats}, nil
}

// Images returns a listing's photographs.
func (s *AdminListingService) Images(ctx context.Context, id uuid.UUID) ([]string, error) {
	images, err := s.listings.Images(ctx, id)
	if err != nil {
		return nil, err
	}
	// An id that matches nothing has no images, which is indistinguishable from
	// a listing with none — so the listing is checked rather than guessed at.
	if len(images) == 0 {
		if _, err := s.listings.Detail(ctx, id); err != nil {
			if errors.Is(err, repository.ErrListingNotFound) {
				return nil, ErrListingNotFound
			}
			return nil, err
		}
	}
	return images, nil
}

// Chats returns the conversations held about a listing.
//
// The owner's alone. Reading somebody else's messages is the most sensitive
// thing this dashboard can do, so it is refused here — in the service, where
// every caller passes — rather than only by hiding the link.
func (s *AdminListingService) Chats(
	ctx context.Context, actor *models.Admin, id uuid.UUID,
) ([]repository.ChatPreview, error) {
	if !actor.IsOwner() {
		return nil, ErrAdminForbidden
	}

	listing, err := s.listings.Detail(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrListingNotFound) {
			return nil, ErrListingNotFound
		}
		return nil, err
	}
	ownerID, err := uuid.Parse(listing.OwnerID)
	if err != nil {
		return nil, fmt.Errorf("listing chats: bad owner id: %w", err)
	}

	return s.listings.Chats(ctx, id, ownerID)
}

func isKnownListingStatus(status string) bool {
	switch status {
	case models.ApartmentStatusDraft, models.ApartmentStatusPending,
		models.ApartmentStatusActive, models.ApartmentStatusClosed,
		models.ApartmentStatusDeleted:
		return true
	}
	return false
}

// OwnerAudit is every conversation held about one person's listings, with the
// messages in them.
type OwnerAudit struct {
	Conversations []repository.OwnerConversation
	Messages      []repository.OwnerMessage
}

// AuditConversations returns the threads about a listing owner's listings.
//
// Reached from a listing but scoped to its owner: an administrator looking into
// somebody's conduct wants every conversation that person has had about what
// they published, not the one thread that happens to mention this flat.
//
// The owner's alone. It returns the text of withdrawn messages, which is the
// most sensitive thing this dashboard can produce, so the check is here — in
// the service every caller passes through — and not in the interface.
func (s *AdminListingService) AuditConversations(
	ctx context.Context, actor *models.Admin, listingID uuid.UUID,
) (*OwnerAudit, error) {
	if !actor.IsOwner() {
		return nil, ErrAdminForbidden
	}

	ownerID, err := s.listings.ListingOwnerID(ctx, listingID)
	if err != nil {
		if errors.Is(err, repository.ErrListingNotFound) {
			return nil, ErrListingNotFound
		}
		return nil, err
	}

	conversations, err := s.listings.OwnerConversations(ctx, ownerID)
	if err != nil {
		return nil, err
	}

	ids := make([]uuid.UUID, 0, len(conversations))
	for _, c := range conversations {
		ids = append(ids, c.ConversationID)
	}
	messages, err := s.listings.OwnerMessages(ctx, ids)
	if err != nil {
		return nil, err
	}

	return &OwnerAudit{Conversations: conversations, Messages: messages}, nil
}

// ChatPage is one page of the moderation chat list.
type ChatPage struct {
	Chats []repository.AdminChatRow
	Total int64
	Page  int
	Limit int
}

// AllChats lists conversations for the moderation table.
//
// Any administrator with the section may see who spoke to whom and when. What
// they said is a separate question, answered by ChatMessages, which is the
// owner's alone.
func (s *AdminListingService) AllChats(
	ctx context.Context, search string, page, limit int,
) (*ChatPage, error) {
	if page < 1 {
		page = 1
	}
	switch {
	case limit < 1:
		limit = s.pageSize(ctx)
	case limit > maxListingPageSize:
		limit = maxListingPageSize
	}

	rows, total, err := s.listings.AllChats(ctx, search, page, limit)
	if err != nil {
		return nil, err
	}
	return &ChatPage{Chats: rows, Total: total, Page: page, Limit: limit}, nil
}

// ChatThread is one conversation with its messages.
type ChatThread struct {
	Buyer    string
	Seller   string
	Messages []repository.OwnerMessage
}

// ChatMessages returns what was said in one conversation.
//
// The owner's alone, for the same reason the listing audit is: this returns the
// text of messages, withdrawn ones included. An administrator who may moderate
// the marketplace is not thereby entitled to read everybody's correspondence.
func (s *AdminListingService) ChatMessages(
	ctx context.Context, actor *models.Admin, id uuid.UUID,
) (*ChatThread, error) {
	if !actor.IsOwner() {
		return nil, ErrAdminForbidden
	}

	buyer, seller, err := s.listings.ChatParticipants(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrConversationNotFound) {
			return nil, ErrConversationNotFound
		}
		return nil, err
	}

	messages, err := s.listings.OwnerMessages(ctx, []uuid.UUID{id})
	if err != nil {
		return nil, err
	}
	return &ChatThread{Buyer: buyer, Seller: seller, Messages: messages}, nil
}

// pageSize is the owner's configured page size, shared with every other table
// in the dashboard.
func (s *AdminListingService) pageSize(ctx context.Context) int {
	if s.settings == nil {
		return Defaults().PaginationDefaultSize
	}
	return s.settings.MustGet(ctx).PaginationDefaultSize
}
