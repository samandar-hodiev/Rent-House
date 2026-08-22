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

// FavoriteHandler serves saved apartments and the dashboard summary.
//
// Every route here is private. The user is always the one the token names —
// there is no id in any path or body that could point at somebody else, which
// is what makes "can I read another user's dashboard by changing an id?" a
// question with no surface to ask it on.
type FavoriteHandler struct {
	favorites *service.FavoriteService
}

func NewFavoriteHandler(favorites *service.FavoriteService) *FavoriteHandler {
	return &FavoriteHandler{favorites: favorites}
}

// List handles GET /api/v1/me/favorites.
func (h *FavoriteHandler) List(c *gin.Context) {
	userID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	saved, err := h.favorites.List(c.Request.Context(), userID)
	if err != nil {
		logger.Errorf("list favorites: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return
	}
	response.OK(c, "", saved)
}

// Save handles POST /api/v1/me/favorites/:apartmentId.
func (h *FavoriteHandler) Save(c *gin.Context) {
	userID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	apartmentID, ok := parseUUIDParam(c, "apartmentId")
	if !ok {
		return
	}

	err := h.favorites.Save(c.Request.Context(), userID, apartmentID)
	switch {
	case err == nil:
		response.OK(c, "", gin.H{"saved": true})
	case errors.Is(err, service.ErrApartmentNotFound):
		response.Error(c, http.StatusNotFound, "apartment_not_found", "Apartment not found")
	default:
		logger.Errorf("save favorite: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
	}
}

// Unsave handles DELETE /api/v1/me/favorites/:apartmentId.
func (h *FavoriteHandler) Unsave(c *gin.Context) {
	userID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	apartmentID, ok := parseUUIDParam(c, "apartmentId")
	if !ok {
		return
	}

	if err := h.favorites.Unsave(c.Request.Context(), userID, apartmentID); err != nil {
		logger.Errorf("unsave favorite: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return
	}
	response.OK(c, "", gin.H{"saved": false})
}

// Summary handles GET /api/v1/me/dashboard/summary — the whole first paint.
func (h *FavoriteHandler) Summary(c *gin.Context) {
	userID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	summary, err := h.favorites.Summary(c.Request.Context(), userID)
	if err != nil {
		logger.Errorf("dashboard summary: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return
	}
	response.OK(c, "", summary)
}
