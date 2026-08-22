package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
)

// DashboardListLimit is how many listings each dashboard section shows.
//
// Three: enough to recognise what is there, few enough that the page stays a
// summary. Anyone who wants the rest follows "Barchasini ko'rish", which is
// what the full page is for.
const DashboardListLimit = 3

// FavoriteService owns saved listings and the dashboard summary built from
// them.
//
// Every method takes the user id from the caller, which is the authenticated
// identity the handler read from the token. Nothing here accepts a user id from
// a request body or a URL, so there is no parameter to tamper with.
type FavoriteService struct {
	favorites  *repository.FavoriteRepository
	apartments *repository.ApartmentRepository
	chat       *repository.ChatRepository
}

func NewFavoriteService(
	favorites *repository.FavoriteRepository,
	apartments *repository.ApartmentRepository,
	chat *repository.ChatRepository,
) *FavoriteService {
	return &FavoriteService{favorites: favorites, apartments: apartments, chat: chat}
}

// Save adds a listing to the user's saved apartments.
//
// Only a published listing can be saved: a draft belongs to its owner and is
// invisible to everyone else, so offering to save it would leak that it exists.
func (s *FavoriteService) Save(ctx context.Context, userID, apartmentID uuid.UUID) error {
	apartment, err := s.apartments.FindByID(ctx, apartmentID)
	if err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return ErrApartmentNotFound
		}
		return err
	}
	if apartment.Status != models.ApartmentStatusActive {
		return ErrApartmentNotFound
	}

	if _, err := s.favorites.Add(ctx, userID, apartmentID); err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return ErrApartmentNotFound
		}
		return err
	}
	return nil
}

// Unsave removes a listing from the user's saved apartments.
func (s *FavoriteService) Unsave(ctx context.Context, userID, apartmentID uuid.UUID) error {
	return s.favorites.Remove(ctx, userID, apartmentID)
}

// List returns the user's saved listings, newest save first.
func (s *FavoriteService) List(
	ctx context.Context, userID uuid.UUID,
) (*dto.FavoriteListResponse, error) {
	apartments, err := s.favorites.ListApartments(ctx, userID, 0)
	if err != nil {
		return nil, err
	}
	ids, err := s.favorites.SavedIDs(ctx, userID)
	if err != nil {
		return nil, err
	}

	items := make([]dto.ApartmentResponse, 0, len(apartments))
	for i := range apartments {
		// No owner contact on a saved card, the same as the public feed: the
		// phone number belongs on the detail page, not on every list.
		items = append(items, dto.NewApartmentResponse(&apartments[i], false))
	}
	savedIDs := make([]string, 0, len(ids))
	for _, id := range ids {
		savedIDs = append(savedIDs, id.String())
	}

	return &dto.FavoriteListResponse{
		Items:    items,
		Total:    int64(len(items)),
		SavedIDs: savedIDs,
	}, nil
}

// Summary is the dashboard's first paint: three counters and two short lists.
func (s *FavoriteService) Summary(
	ctx context.Context, userID uuid.UUID,
) (*dto.DashboardSummaryResponse, error) {
	activeListings, err := s.apartments.CountByOwner(ctx, userID, models.ApartmentStatusActive)
	if err != nil {
		return nil, err
	}
	totalListings, err := s.apartments.CountByOwner(ctx, userID, "")
	if err != nil {
		return nil, err
	}
	unread, err := s.chat.UnreadTotal(ctx, userID)
	if err != nil {
		return nil, err
	}
	saved, err := s.favorites.Count(ctx, userID)
	if err != nil {
		return nil, err
	}

	// The owner's own listings, newest first, capped at what the section shows.
	recent, _, err := s.apartments.List(ctx, repository.ApartmentFilter{
		OwnerID: &userID,
		Sort:    repository.SortNewest,
		Limit:   DashboardListLimit,
	})
	if err != nil {
		return nil, err
	}

	recentSaved, err := s.favorites.ListApartments(ctx, userID, DashboardListLimit)
	if err != nil {
		return nil, err
	}

	out := &dto.DashboardSummaryResponse{
		Counts: dto.DashboardCounts{
			ActiveListings:  activeListings,
			TotalListings:   totalListings,
			UnreadMessages:  unread,
			SavedApartments: saved,
		},
		// Never nil: the client maps over both without a guard.
		RecentListings: make([]dto.ApartmentResponse, 0, len(recent)),
		RecentSaved:    make([]dto.ApartmentResponse, 0, len(recentSaved)),
	}
	for i := range recent {
		// The owner's own listings, so their own contact details are not a leak.
		out.RecentListings = append(out.RecentListings, dto.NewApartmentResponse(&recent[i], true))
	}
	for i := range recentSaved {
		out.RecentSaved = append(out.RecentSaved, dto.NewApartmentResponse(&recentSaved[i], false))
	}
	return out, nil
}
