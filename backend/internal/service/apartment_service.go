package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
)

// Errors the apartment service reports. Each maps to one HTTP status in the
// handler, so the handler never has to interpret a database error.
var (
	// ErrApartmentNotFound is a listing that does not exist — or, for a
	// non-owner, one that is not published. The two are deliberately
	// indistinguishable from outside: telling a stranger that a draft exists
	// but is not theirs leaks the fact that it exists at all.
	ErrApartmentNotFound = errors.New("apartment not found")

	// ErrNotApartmentOwner is the authorization failure: the listing exists and
	// the caller is signed in, but it is not theirs.
	ErrNotApartmentOwner = errors.New("apartment belongs to another user")

	// ErrInvalidDistrict and ErrInvalidAmenity are validation failures the
	// binding tags cannot catch, because they depend on what is in the database.
	ErrInvalidDistrict = errors.New("district does not exist")
	ErrInvalidAmenity  = errors.New("amenity does not exist")

	// ErrInvalidPrice covers a price or deposit that parses as a number but is
	// not a usable amount.
	ErrInvalidPrice = errors.New("price is not a valid amount")

	// ErrInvalidFloors is floor > total_floors, which the CHECK would also
	// reject — but as a 500 rather than a message the user can act on.
	ErrInvalidFloors = errors.New("floor cannot be above the building's height")
)

// ApartmentService holds the listing rules: who may change what, which fields a
// client is allowed to set, and when a listing becomes publicly visible.
type ApartmentService struct {
	apartments *repository.ApartmentRepository
}

func NewApartmentService(apartments *repository.ApartmentRepository) *ApartmentService {
	return &ApartmentService{apartments: apartments}
}

// Create publishes or drafts a new listing owned by `ownerID`.
//
// `ownerID` is the authenticated user, passed in by the handler from the token.
// The request type has no owner field at all, so there is nothing for a client
// to spoof.
func (s *ApartmentService) Create(
	ctx context.Context, ownerID uuid.UUID, req dto.ApartmentWriteRequest,
) (*dto.ApartmentResponse, error) {
	apartment, amenityIDs, err := s.build(ctx, req)
	if err != nil {
		return nil, err
	}

	apartment.OwnerID = ownerID
	apartment.Status = statusFor(req.Publish)

	if err := s.apartments.Create(ctx, apartment, amenityIDs); err != nil {
		if errors.Is(err, repository.ErrDistrictNotFound) {
			return nil, ErrInvalidDistrict
		}
		return nil, err
	}

	// Re-read so the response carries the district, owner and images as stored,
	// rather than a half-populated struct assembled here.
	return s.get(ctx, apartment.ID, true)
}

// Get returns one listing.
//
// `viewerID` is nil for an anonymous request. A draft or closed listing is
// visible only to its owner; to anyone else it does not exist.
func (s *ApartmentService) Get(
	ctx context.Context, id uuid.UUID, viewerID *uuid.UUID,
) (*dto.ApartmentResponse, error) {
	apartment, err := s.apartments.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return nil, ErrApartmentNotFound
		}
		return nil, err
	}

	isOwner := viewerID != nil && apartment.OwnerID == *viewerID
	if apartment.Status != models.ApartmentStatusActive && !isOwner {
		return nil, ErrApartmentNotFound
	}

	// Counting a view is a side effect of reading, not the point of it: a
	// failure here must not stop the page from rendering, and the owner
	// refreshing their own listing must not inflate the number.
	if !isOwner {
		_ = s.apartments.IncrementViews(ctx, id)
		apartment.ViewsCount++
	}

	response := dto.NewApartmentResponse(apartment, true)
	return &response, nil
}

// List returns a page of publicly visible listings.
func (s *ApartmentService) List(
	ctx context.Context, query dto.ApartmentListQuery,
) (*dto.ApartmentListResponse, error) {
	filter, err := s.filterFrom(ctx, query)
	if err != nil {
		return nil, err
	}
	// The public feed shows published listings only. Nothing a client sends can
	// widen this.
	filter.Status = models.ApartmentStatusActive

	return s.page(ctx, filter, query, false)
}

// ListForOwner returns the signed-in user's own listings, in every status —
// this is the dashboard, where a draft is exactly what they came to find.
func (s *ApartmentService) ListForOwner(
	ctx context.Context, ownerID uuid.UUID, query dto.ApartmentListQuery,
) (*dto.ApartmentListResponse, error) {
	filter, err := s.filterFrom(ctx, query)
	if err != nil {
		return nil, err
	}
	filter.OwnerID = &ownerID

	return s.page(ctx, filter, query, true)
}

// CountActiveForOwner backs the dashboard's "Faol e'lonlar" figure.
func (s *ApartmentService) CountActiveForOwner(
	ctx context.Context, ownerID uuid.UUID,
) (active, total int64, err error) {
	active, err = s.apartments.CountByOwner(ctx, ownerID, models.ApartmentStatusActive)
	if err != nil {
		return 0, 0, err
	}
	total, err = s.apartments.CountByOwner(ctx, ownerID, "")
	if err != nil {
		return 0, 0, err
	}
	return active, total, nil
}

// Update replaces a listing's content.
//
// The ownership check happens here, in the service, before anything is written.
// A handler that forgot to check, or a second caller added later, cannot bypass
// it — which is the whole reason it does not live in the handler.
func (s *ApartmentService) Update(
	ctx context.Context, id uuid.UUID, actorID uuid.UUID, req dto.ApartmentWriteRequest,
) (*dto.ApartmentResponse, error) {
	if err := s.assertOwner(ctx, id, actorID); err != nil {
		return nil, err
	}

	apartment, amenityIDs, err := s.build(ctx, req)
	if err != nil {
		return nil, err
	}

	// An explicit column list. owner_id, views_count and created_at are absent,
	// so an edit cannot reassign a listing, reset its popularity or rewrite its
	// history. Status is set from `publish`, which is the only transition the
	// owner form offers.
	fields := map[string]any{
		"title":          apartment.Title,
		"description":    apartment.Description,
		"price":          apartment.Price,
		"currency":       apartment.Currency,
		"rental_period":  apartment.RentalPeriod,
		"rooms":          apartment.Rooms,
		"area":           apartment.Area,
		"floor":          apartment.Floor,
		"total_floors":   apartment.TotalFloors,
		"furnished":      apartment.Furnished,
		"district_id":    apartment.DistrictID,
		"neighborhood":   apartment.Neighborhood,
		"address":        apartment.Address,
		"latitude":       apartment.Latitude,
		"longitude":      apartment.Longitude,
		"deposit":        apartment.Deposit,
		"utilities":      apartment.Utilities,
		"minimum_months": apartment.MinimumMonths,
		"rules":          apartment.Rules,
		"status":         statusFor(req.Publish),
	}

	if err := s.apartments.Update(ctx, id, fields, apartment.Images, amenityIDs); err != nil {
		if errors.Is(err, repository.ErrDistrictNotFound) {
			return nil, ErrInvalidDistrict
		}
		return nil, err
	}

	return s.get(ctx, id, true)
}

// Delete removes a listing the caller owns.
func (s *ApartmentService) Delete(ctx context.Context, id uuid.UUID, actorID uuid.UUID) error {
	if err := s.assertOwner(ctx, id, actorID); err != nil {
		return err
	}
	if err := s.apartments.Delete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return ErrApartmentNotFound
		}
		return err
	}
	return nil
}

// Districts lists the districts a listing can be placed in.
func (s *ApartmentService) Districts(ctx context.Context) ([]dto.DistrictResponse, error) {
	districts, err := s.apartments.ListDistricts(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]dto.DistrictResponse, 0, len(districts))
	for _, district := range districts {
		out = append(out, dto.DistrictResponse{
			Slug:      district.Slug,
			Name:      district.Name,
			Latitude:  district.Latitude,
			Longitude: district.Longitude,
		})
	}
	return out, nil
}

// --- internals -------------------------------------------------------------

// assertOwner is the single authorization gate for writes.
//
// A listing that does not exist and one owned by someone else are reported
// differently on purpose: the caller is authenticated, and "this is not yours"
// is the accurate answer. It reveals only that an id is taken, which the id
// itself already implies.
func (s *ApartmentService) assertOwner(ctx context.Context, id, actorID uuid.UUID) error {
	ownerID, err := s.apartments.FindOwnerID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return ErrApartmentNotFound
		}
		return err
	}
	if ownerID != actorID {
		return ErrNotApartmentOwner
	}
	return nil
}

// build validates a write request against the database and turns it into a
// model. It sets no owner and no status — those are the caller's decision.
func (s *ApartmentService) build(
	ctx context.Context, req dto.ApartmentWriteRequest,
) (*models.Apartment, []uuid.UUID, error) {
	if req.Floor > req.TotalFloors {
		return nil, nil, ErrInvalidFloors
	}

	price, ok := dto.ParsePositiveDecimal(req.Price)
	if !ok {
		return nil, nil, ErrInvalidPrice
	}

	district, err := s.apartments.FindDistrictBySlug(ctx, req.DistrictSlug)
	if err != nil {
		if errors.Is(err, repository.ErrDistrictNotFound) {
			return nil, nil, ErrInvalidDistrict
		}
		return nil, nil, err
	}

	// Every submitted slug must resolve. Dropping the unknown ones silently
	// would save a listing that claims fewer amenities than the owner ticked.
	amenityIDs, err := s.apartments.FindAmenityIDsBySlugs(ctx, req.Amenities)
	if err != nil {
		return nil, nil, err
	}
	if len(amenityIDs) != len(req.Amenities) {
		return nil, nil, ErrInvalidAmenity
	}

	apartment := &models.Apartment{
		DistrictID:   district.ID,
		Title:        req.Title,
		Description:  req.Description,
		Price:        price,
		Currency:     req.Currency,
		RentalPeriod: req.RentalPeriod,
		Rooms:        req.Rooms,
		Area:         req.Area,
		Floor:        req.Floor,
		TotalFloors:  req.TotalFloors,
		Furnished:    req.Furnished,
		Address:      req.Address,
		Latitude:     req.Latitude,
		Longitude:    req.Longitude,
		Utilities:    req.Utilities,
		Rules:        req.Rules,
		Images:       buildImages(req.Images),
	}

	if req.Neighborhood != "" {
		neighborhood := req.Neighborhood
		apartment.Neighborhood = &neighborhood
	}
	if req.Deposit != "" {
		deposit, ok := dto.ParseNonNegativeDecimal(req.Deposit)
		if !ok {
			return nil, nil, ErrInvalidPrice
		}
		apartment.Deposit = &deposit
	}
	if req.MinimumMonths != nil {
		apartment.MinimumMonths = req.MinimumMonths
	}

	return apartment, amenityIDs, nil
}

// buildImages numbers the gallery and guarantees exactly one cover.
//
// The partial unique index in the migration allows only one primary row per
// listing, so a request marking two would otherwise fail at the database with
// an error the user could not act on.
func buildImages(inputs []dto.ApartmentImageInput) []models.ApartmentImage {
	if len(inputs) == 0 {
		return nil
	}

	images := make([]models.ApartmentImage, 0, len(inputs))
	primaryTaken := false
	for i, input := range inputs {
		isPrimary := input.IsPrimary && !primaryTaken
		if isPrimary {
			primaryTaken = true
		}
		images = append(images, models.ApartmentImage{
			URL:       input.URL,
			IsPrimary: isPrimary,
			SortOrder: int16(i),
		})
	}
	// Nothing was marked: the first picture is the cover, which is what the
	// gallery shows anyway.
	if !primaryTaken {
		images[0].IsPrimary = true
	}
	return images
}

// filterFrom translates the query string into a repository filter, resolving
// the district slug to an id.
func (s *ApartmentService) filterFrom(
	ctx context.Context, query dto.ApartmentListQuery,
) (repository.ApartmentFilter, error) {
	filter := repository.ApartmentFilter{
		Keyword:   query.Keyword,
		Rooms:     query.Rooms,
		Furnished: query.Furnished,
		Sort:      query.Sort,
		Limit:     query.Limit,
		Offset:    query.Offset(),
	}

	if query.District != "" {
		district, err := s.apartments.FindDistrictBySlug(ctx, query.District)
		if err != nil {
			if errors.Is(err, repository.ErrDistrictNotFound) {
				return filter, ErrInvalidDistrict
			}
			return filter, err
		}
		filter.DistrictID = &district.ID
	}

	if query.MinPrice != "" {
		amount, ok := dto.ParseNonNegativeDecimal(query.MinPrice)
		if !ok {
			return filter, ErrInvalidPrice
		}
		filter.MinPrice = &amount
	}
	if query.MaxPrice != "" {
		amount, ok := dto.ParseNonNegativeDecimal(query.MaxPrice)
		if !ok {
			return filter, ErrInvalidPrice
		}
		filter.MaxPrice = &amount
	}

	return filter, nil
}

// page runs a filtered query and wraps it with the pager's numbers.
func (s *ApartmentService) page(
	ctx context.Context,
	filter repository.ApartmentFilter,
	query dto.ApartmentListQuery,
	includeOwnerContact bool,
) (*dto.ApartmentListResponse, error) {
	apartments, total, err := s.apartments.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	items := make([]dto.ApartmentResponse, 0, len(apartments))
	for i := range apartments {
		items = append(items, dto.NewApartmentResponse(&apartments[i], includeOwnerContact))
	}

	pages := 0
	if query.Limit > 0 {
		pages = int((total + int64(query.Limit) - 1) / int64(query.Limit))
	}

	return &dto.ApartmentListResponse{
		Items: items,
		Total: total,
		Page:  query.Page,
		Limit: query.Limit,
		Pages: pages,
	}, nil
}

// get reloads a listing for a response, bypassing the visibility rule in Get:
// the caller has already established that it is theirs.
func (s *ApartmentService) get(
	ctx context.Context, id uuid.UUID, includeOwnerContact bool,
) (*dto.ApartmentResponse, error) {
	apartment, err := s.apartments.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return nil, ErrApartmentNotFound
		}
		return nil, fmt.Errorf("reload apartment: %w", err)
	}
	response := dto.NewApartmentResponse(apartment, includeOwnerContact)
	return &response, nil
}

// statusFor maps the form's publish toggle onto a listing status. Only these
// two are reachable from the API; `pending` and `closed` belong to moderation
// and to the owner's archive action, which are separate features.
func statusFor(publish bool) string {
	if publish {
		return models.ApartmentStatusActive
	}
	return models.ApartmentStatusDraft
}
