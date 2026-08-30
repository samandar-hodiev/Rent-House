package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"

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

	// ErrInvalidStatusChange is a transition the lifecycle does not allow —
	// reviving a deleted listing straight to public, for instance.
	ErrInvalidStatusChange = errors.New("listing cannot move to that status")
	ErrInvalidAmenity      = errors.New("amenity does not exist")

	// ErrInvalidPrice covers a price or deposit that parses as a number but is
	// not a usable amount.
	ErrInvalidPrice = errors.New("price is not a valid amount")

	// ErrInvalidFloors is floor > total_floors, which the CHECK would also
	// reject — but as a 500 rather than a message the user can act on.
	ErrInvalidFloors = errors.New("floor cannot be above the building's height")

	// ErrTooManyImages is more photographs than the marketplace's configured
	// limit. The binding tag enforces the ceiling the schema can take; this
	// enforces the number the owner actually chose.
	ErrTooManyImages = errors.New("too many images for one listing")

	// ErrTooFewImages is a listing published with fewer photographs than the
	// marketplace asks for. Drafts are exempt: a draft is somewhere to put a
	// listing that is not finished yet.
	ErrTooFewImages = errors.New("not enough images for one listing")

	// ErrTitleTooLong and ErrDescriptionTooLong are the configured lengths.
	ErrTitleTooLong       = errors.New("title is longer than allowed")
	ErrDescriptionTooLong = errors.New("description is longer than allowed")

	// ErrDraftsDisabled, ErrEditingDisabled, ErrDeletionDisabled and
	// ErrRepublishDisabled are actions the owner has switched off for the
	// whole marketplace on the settings page.
	ErrDraftsDisabled    = errors.New("drafts are switched off")
	ErrEditingDisabled   = errors.New("editing a listing is switched off")
	ErrDeletionDisabled  = errors.New("deleting a listing is switched off")
	ErrRepublishDisabled = errors.New("republishing a listing is switched off")
)

// ApartmentService holds the listing rules: who may change what, which fields a
// client is allowed to set, and when a listing becomes publicly visible.
type ApartmentService struct {
	apartments *repository.ApartmentRepository
	// How the marketplace is configured. Consulted on every write rather than
	// read once at start-up, so switching moderation on takes effect on the
	// next listing instead of on the next deployment.
	settings *SettingsService
}

func NewApartmentService(
	apartments *repository.ApartmentRepository, settings *SettingsService,
) *ApartmentService {
	return &ApartmentService{apartments: apartments, settings: settings}
}

// applySettings enforces the configured rules on a write.
//
// Returns the status the listing should take. It is here, in the service, and
// not in the handler for the usual reason: every path that writes a listing
// goes through this, so there is no route that can be added later and forget.
func (s *ApartmentService) applySettings(
	ctx context.Context, req dto.ApartmentWriteRequest, editing bool,
) (string, error) {
	settings, err := s.settings.Get(ctx)
	if err != nil {
		return "", err
	}

	if len([]rune(req.Title)) > settings.ListingMaxTitleLength {
		return "", fmt.Errorf("%w: %d characters allowed",
			ErrTitleTooLong, settings.ListingMaxTitleLength)
	}
	if len([]rune(req.Description)) > settings.ListingMaxDescriptionLength {
		return "", fmt.Errorf("%w: %d characters allowed",
			ErrDescriptionTooLong, settings.ListingMaxDescriptionLength)
	}
	if len(req.Images) > settings.ListingMaxImages {
		return "", fmt.Errorf("%w: %d allowed", ErrTooManyImages, settings.ListingMaxImages)
	}

	if !req.Publish {
		// A draft is a listing that is not finished. Switching drafts off means
		// a listing is written to be published or not written at all.
		if !settings.ListingDraftsAllowed {
			return "", ErrDraftsDisabled
		}
		return models.ApartmentStatusDraft, nil
	}

	// Published listings must carry enough photographs to be worth looking at.
	// Checked only on publication, so a draft can be saved half-finished.
	if len(req.Images) < settings.ListingMinImages {
		return "", fmt.Errorf("%w: %d needed", ErrTooFewImages, settings.ListingMinImages)
	}

	// Moderation. On creation the switch is the listings one; on an edit it is
	// the moderation section's own, because re-checking every edit is a
	// separate decision from checking every new listing.
	if editing {
		if settings.ListingModerationRequired && settings.ListingEditModerationRequired {
			return models.ApartmentStatusPending, nil
		}
		return models.ApartmentStatusActive, nil
	}
	if settings.ListingModerationRequired {
		return models.ApartmentStatusPending, nil
	}
	return models.ApartmentStatusActive, nil
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
	apartment.Status, err = s.applySettings(ctx, req, false)
	if err != nil {
		return nil, err
	}
	// Publishing stamps the moment the listing went live. Analytics read this,
	// and the schema requires it to agree with the status.
	if apartment.Status == models.ApartmentStatusActive {
		now := time.Now()
		apartment.PublishedAt = &now
	}

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

	// Counting the view is no longer done here. It is a recorded event now, not
	// a counter bump — see AnalyticsService.RecordView, which the handler calls
	// before this so the count below is already current. Keeping it out of the
	// read path also means a failure to count cannot stop the page rendering.

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
	if err := s.assertAllowed(ctx, func(current *Settings) bool {
		return current.ListingOwnerCanEdit
	}, ErrEditingDisabled); err != nil {
		return nil, err
	}

	apartment, amenityIDs, err := s.build(ctx, req)
	if err != nil {
		return nil, err
	}

	status, err := s.applySettings(ctx, req, true)
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
		"status":         status,
	}

	if err := s.apartments.Update(ctx, id, fields, apartment.Images, amenityIDs); err != nil {
		if errors.Is(err, repository.ErrDistrictNotFound) {
			return nil, ErrInvalidDistrict
		}
		return nil, err
	}

	return s.get(ctx, id, true)
}

// ChangeStatus moves a listing through its lifecycle.
//
// The owner's own transitions only — a draft going live, a live listing being
// paused or closed, a listing being removed. Which target is allowed from which
// state is decided here rather than by the client, so a crafted request cannot
// put a listing somewhere the UI never offers.
//
// `published_at` is maintained alongside the status because the database
// insists the two agree: `ck_apartments_published_at` says a listing carries a
// publication date exactly when it is active. Setting one without the other
// fails the constraint, which is precisely what makes it worth having.
func (s *ApartmentService) ChangeStatus(
	ctx context.Context, id, actorID uuid.UUID, target string,
) (*dto.ApartmentResponse, error) {
	if err := s.assertOwner(ctx, id, actorID); err != nil {
		return nil, err
	}

	current, err := s.apartments.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return nil, ErrApartmentNotFound
		}
		return nil, err
	}

	if !allowedTransition(current.Status, target) {
		return nil, ErrInvalidStatusChange
	}

	// Bringing a closed or drafted listing back into public view is publishing
	// it again, and the owner of the marketplace can switch that off.
	if target == models.ApartmentStatusActive {
		if err := s.assertAllowed(ctx, func(settings *Settings) bool {
			return settings.ListingRepublishAllowed
		}, ErrRepublishDisabled); err != nil {
			return nil, err
		}
		// And it goes back through moderation if the marketplace asks for it,
		// rather than straight to the public.
		if settings, err := s.settings.Get(ctx); err == nil && settings.ListingModerationRequired {
			target = models.ApartmentStatusPending
		}
	}

	fields := map[string]any{"status": target}
	if target == models.ApartmentStatusActive {
		// Re-published: it needs a date, and keeping the original would date a
		// listing to a moment it was not actually visible.
		fields["published_at"] = time.Now().UTC()
	} else {
		fields["published_at"] = nil
	}

	if err := s.apartments.UpdateFields(ctx, id, fields); err != nil {
		if errors.Is(err, repository.ErrApartmentNotFound) {
			return nil, ErrApartmentNotFound
		}
		return nil, err
	}

	return s.get(ctx, id, true)
}

// allowedTransition is the lifecycle, written out.
//
// Deliberately not "anything to anything": a listing cannot go straight from
// deleted back to active, and closing a draft that was never published is not a
// thing the interface offers. Everything an owner can reach is reachable in one
// or two steps through states that mean something.
func allowedTransition(from, to string) bool {
	if from == to {
		return false
	}
	// Removing is always available, from wherever the listing currently is.
	if to == models.ApartmentStatusDeleted {
		return from != models.ApartmentStatusDeleted
	}
	switch from {
	case models.ApartmentStatusDraft:
		// A draft goes live. Nothing else to do with one that has never been
		// published.
		return to == models.ApartmentStatusActive
	case models.ApartmentStatusActive:
		return to == models.ApartmentStatusPending || to == models.ApartmentStatusClosed
	case models.ApartmentStatusPending:
		return to == models.ApartmentStatusActive || to == models.ApartmentStatusClosed
	case models.ApartmentStatusClosed:
		// Re-opening something that was closed.
		return to == models.ApartmentStatusActive
	case models.ApartmentStatusDeleted:
		// Restoring a removed listing puts it back out of sight, not straight
		// back in front of the public.
		return to == models.ApartmentStatusDraft
	default:
		return false
	}
}

// Delete removes a listing the caller owns.
// A soft delete: the row stays and its status becomes `deleted`.
//
// Erasing it would take the conversations people had about it, the view history
// its analytics are built from and anyone who had saved it. It is also
// unrecoverable for an owner who meant "take this down" rather than "destroy
// this". It stops being public either way, which is what "delete" has to mean
// to everybody else.
func (s *ApartmentService) Delete(ctx context.Context, id uuid.UUID, actorID uuid.UUID) error {
	if err := s.assertOwner(ctx, id, actorID); err != nil {
		return err
	}
	if err := s.assertAllowed(ctx, func(current *Settings) bool {
		return current.ListingOwnerCanDelete
	}, ErrDeletionDisabled); err != nil {
		return err
	}

	fields := map[string]any{
		"status": models.ApartmentStatusDeleted,
		// Required by ck_apartments_published_at: only an active listing has a
		// publication date.
		"published_at": nil,
	}
	if err := s.apartments.UpdateFields(ctx, id, fields); err != nil {
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
		// Optional in the form, mandatory in the row: the column has a default
		// that an insert picks up but an explicit update would overwrite with
		// an empty string the CHECK rejects.
		Utilities: utilitiesOr(req.Utilities),
		// Never nil. The column is NOT NULL with a default, which covers an
		// insert but not an update: writing the field explicitly, as Update
		// does, would write NULL and be rejected. A listing with no rules has
		// an empty list, not a missing one.
		Rules:  append(pq.StringArray{}, req.Rules...),
		Images: buildImages(req.Images),
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

// assertAllowed refuses an action the marketplace has switched off.
//
// A failed read allows the action: the settings are how the owner narrows what
// the marketplace does, and a database hiccup should not narrow it further.
func (s *ApartmentService) assertAllowed(
	ctx context.Context, allowed func(*Settings) bool, refusal error,
) error {
	settings, err := s.settings.Get(ctx)
	if err != nil {
		return nil
	}
	if !allowed(settings) {
		return refusal
	}
	return nil
}

// utilitiesOr fills in the marketplace's default for an owner who did not say.
func utilitiesOr(value string) string {
	if value == "" {
		return models.UtilitiesIncluded
	}
	return value
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
