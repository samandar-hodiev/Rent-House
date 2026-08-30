package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// ApartmentHandler is HTTP only: bind, call the service, map the result onto a
// status code. Every rule about who may do what lives in the service.
type ApartmentHandler struct {
	apartments *service.ApartmentService
	// analytics records the view a detail request represents. Optional: the
	// integration tests build the handler without it, and a listing page that
	// does not count its readers is still a working listing page.
	analytics *service.AnalyticsService
}

func NewApartmentHandler(
	apartments *service.ApartmentService, analytics *service.AnalyticsService,
) *ApartmentHandler {
	return &ApartmentHandler{apartments: apartments, analytics: analytics}
}

// Create handles POST /api/v1/apartments.
func (h *ApartmentHandler) Create(c *gin.Context) {
	ownerID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	var req dto.ApartmentWriteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	req.Normalize()

	// The owner is the authenticated user. The request type carries no owner
	// field, so there is nothing here to override.
	apartment, err := h.apartments.Create(c.Request.Context(), ownerID, req)
	if err != nil {
		h.writeError(c, err, "create apartment")
		return
	}

	response.Success(c, http.StatusCreated, "Apartment created", apartment)
}

// List handles GET /api/v1/apartments — the public feed.
func (h *ApartmentHandler) List(c *gin.Context) {
	var query dto.ApartmentListQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	query.Normalize()

	page, err := h.apartments.List(c.Request.Context(), query)
	if err != nil {
		h.writeError(c, err, "list apartments")
		return
	}

	response.OK(c, "", page)
}

// Get handles GET /api/v1/apartments/:id.
//
// Public, but the token is read when one is present: an owner may open their
// own draft, and no one else can.
func (h *ApartmentHandler) Get(c *gin.Context) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	var viewerID *uuid.UUID
	if userID, authenticated := middleware.UserIDFrom(c); authenticated {
		viewerID = &userID
	}

	// Count the view before reading, so the number this response carries
	// already includes it. Everything about whether it *should* count — the
	// listing is published, the viewer is not its owner, this visitor has not
	// been counted in the last hour — is decided inside RecordView.
	//
	// A failure is logged and dropped: analytics are a side effect of someone
	// reading a page, and must never be the reason the page fails to load.
	if h.analytics != nil {
		if _, err := h.analytics.RecordView(c.Request.Context(), service.ViewRequest{
			ApartmentID: id,
			ViewerID:    viewerID,
			RemoteAddr:  c.ClientIP(),
			UserAgent:   c.Request.UserAgent(),
		}); err != nil {
			logger.Errorf("record apartment view: %v", err)
		}
	}

	apartment, err := h.apartments.Get(c.Request.Context(), id, viewerID)
	if err != nil {
		h.writeError(c, err, "get apartment")
		return
	}

	response.OK(c, "", apartment)
}

// ListMine handles GET /api/v1/me/apartments — the owner's dashboard.
func (h *ApartmentHandler) ListMine(c *gin.Context) {
	ownerID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	var query dto.ApartmentListQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	query.Normalize()

	page, err := h.apartments.ListForOwner(c.Request.Context(), ownerID, query)
	if err != nil {
		h.writeError(c, err, "list own apartments")
		return
	}

	response.OK(c, "", page)
}

// Stats handles GET /api/v1/me/apartments/stats — the dashboard counters.
func (h *ApartmentHandler) Stats(c *gin.Context) {
	ownerID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	active, total, err := h.apartments.CountActiveForOwner(c.Request.Context(), ownerID)
	if err != nil {
		h.writeError(c, err, "count own apartments")
		return
	}

	response.OK(c, "", gin.H{"active_listings": active, "total_listings": total})
}

// Update handles PUT /api/v1/apartments/:id.
func (h *ApartmentHandler) Update(c *gin.Context) {
	actorID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	var req dto.ApartmentWriteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	req.Normalize()

	apartment, err := h.apartments.Update(c.Request.Context(), id, actorID, req)
	if err != nil {
		h.writeError(c, err, "update apartment")
		return
	}

	response.OK(c, "Apartment updated", apartment)
}

// Delete handles DELETE /api/v1/apartments/:id.
// ChangeStatus handles PATCH /api/v1/apartments/:id/status.
//
// The listing's lifecycle, as its owner drives it: publishing a draft, pausing
// a live listing, closing one, taking one down. Ownership is checked in the
// service against the token's account, so this cannot be aimed at somebody
// else's listing.
func (h *ApartmentHandler) ChangeStatus(c *gin.Context) {
	actorID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	var req dto.ChangeStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}

	apartment, err := h.apartments.ChangeStatus(c.Request.Context(), id, actorID, req.Status)
	if err != nil {
		if errors.Is(err, service.ErrInvalidStatusChange) {
			response.Error(c, http.StatusConflict, "invalid_status_change",
				"This listing cannot move to that status")
			return
		}
		h.writeError(c, err, "change listing status")
		return
	}

	response.OK(c, "Status updated", apartment)
}

func (h *ApartmentHandler) Delete(c *gin.Context) {
	actorID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	if err := h.apartments.Delete(c.Request.Context(), id, actorID); err != nil {
		h.writeError(c, err, "delete apartment")
		return
	}

	response.OK(c, "Apartment deleted", nil)
}

// Districts handles GET /api/v1/districts.
func (h *ApartmentHandler) Districts(c *gin.Context) {
	districts, err := h.apartments.Districts(c.Request.Context())
	if err != nil {
		h.writeError(c, err, "list districts")
		return
	}
	response.OK(c, "", districts)
}

// writeError maps a service error onto a status and a stable code.
//
// One place for the mapping, so every endpoint answers the same way — and so an
// unrecognised error can only ever become a logged 500, never a leaked
// driver message.
func (h *ApartmentHandler) writeError(c *gin.Context, err error, operation string) {
	switch {
	case errors.Is(err, service.ErrApartmentNotFound):
		response.Error(c, http.StatusNotFound, "apartment_not_found", "Apartment not found")
	case errors.Is(err, service.ErrNotApartmentOwner):
		response.Error(c, http.StatusForbidden, "not_apartment_owner",
			"This listing belongs to another user")
	case errors.Is(err, service.ErrInvalidDistrict):
		response.Error(c, http.StatusBadRequest, "invalid_district", "Unknown district")
	case errors.Is(err, service.ErrInvalidAmenity):
		response.Error(c, http.StatusBadRequest, "invalid_amenity", "Unknown amenity")
	case errors.Is(err, service.ErrInvalidPrice):
		response.Error(c, http.StatusBadRequest, "invalid_price", "Price is not a valid amount")
	case errors.Is(err, service.ErrInvalidFloors):
		response.Error(c, http.StatusBadRequest, "invalid_floors",
			"Floor cannot be above the building's height")
	case errors.Is(err, service.ErrTooManyImages):
		// The message carries the configured limit, so the form can tell the
		// owner the number rather than that there was one.
		response.Error(c, http.StatusBadRequest, "too_many_images", err.Error())
	case errors.Is(err, service.ErrTooFewImages):
		response.Error(c, http.StatusBadRequest, "too_few_images", err.Error())
	case errors.Is(err, service.ErrTitleTooLong):
		response.Error(c, http.StatusBadRequest, "title_too_long", err.Error())
	case errors.Is(err, service.ErrDescriptionTooLong):
		response.Error(c, http.StatusBadRequest, "description_too_long", err.Error())
	// Switched off for the whole marketplace rather than refused for this
	// caller: 403 with a code the form can turn into an explanation.
	case errors.Is(err, service.ErrDraftsDisabled):
		response.Error(c, http.StatusForbidden, "drafts_disabled",
			"Saving a listing as a draft is switched off")
	case errors.Is(err, service.ErrEditingDisabled):
		response.Error(c, http.StatusForbidden, "editing_disabled",
			"Editing a listing is switched off")
	case errors.Is(err, service.ErrDeletionDisabled):
		response.Error(c, http.StatusForbidden, "deletion_disabled",
			"Deleting a listing is switched off")
	case errors.Is(err, service.ErrRepublishDisabled):
		response.Error(c, http.StatusForbidden, "republish_disabled",
			"Republishing a listing is switched off")
	default:
		logger.Errorf("%s: %v", operation, err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
	}
}

// parseUUIDParam reads a uuid path parameter, answering 404 for anything that
// is not one: a malformed id names no listing, which is the same outcome as an
// id that names nothing.
func parseUUIDParam(c *gin.Context, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil {
		response.Error(c, http.StatusNotFound, "apartment_not_found", "Apartment not found")
		return uuid.Nil, false
	}
	return id, true
}
