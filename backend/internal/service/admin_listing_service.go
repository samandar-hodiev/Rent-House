package service

import (
	"context"
	"errors"
	"fmt"

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
}

func NewAdminListingService(listings *repository.AdminListingRepository) *AdminListingService {
	return &AdminListingService{listings: listings}
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
		limit = 10
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
