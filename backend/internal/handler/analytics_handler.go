package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// AnalyticsHandler serves the view timelines behind the dashboard chart.
type AnalyticsHandler struct {
	analytics *service.AnalyticsService
}

func NewAnalyticsHandler(analytics *service.AnalyticsService) *AnalyticsHandler {
	return &AnalyticsHandler{analytics: analytics}
}

// OwnerViews handles GET /api/v1/me/analytics/views — every published listing
// the signed-in user owns, aggregated into one timeline.
func (h *AnalyticsHandler) OwnerViews(c *gin.Context) {
	ownerID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	analytics, err := h.analytics.OwnerAnalytics(c.Request.Context(), ownerID)
	if err != nil {
		logger.Errorf("owner analytics: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return
	}

	response.OK(c, "", analytics)
}

// ApartmentViews handles GET /api/v1/apartments/:id/analytics — one listing's
// timeline, for its owner.
func (h *AnalyticsHandler) ApartmentViews(c *gin.Context) {
	actorID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	analytics, err := h.analytics.ApartmentAnalytics(c.Request.Context(), id, actorID)
	switch {
	case err == nil:
		response.OK(c, "", analytics)
	case errors.Is(err, service.ErrApartmentNotFound):
		response.Error(c, http.StatusNotFound, "apartment_not_found", "Apartment not found")
	case errors.Is(err, service.ErrNotApartmentOwner):
		response.Error(c, http.StatusForbidden, "not_apartment_owner",
			"This listing belongs to another user")
	default:
		logger.Errorf("apartment analytics: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
	}
}
