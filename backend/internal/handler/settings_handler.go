package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// SettingsHandler serves the marketplace's own configuration to its frontend.
type SettingsHandler struct {
	settings *service.SettingsService
}

func NewSettingsHandler(settings *service.SettingsService) *SettingsHandler {
	return &SettingsHandler{settings: settings}
}

// Public handles GET /api/v1/settings.
//
// Unauthenticated on purpose: the site name, the language it opens in and
// whether it is in maintenance are needed before anybody has signed in — a
// visitor who cannot read this cannot be shown the maintenance notice either.
// Only the public subset is returned; see Settings.Public.
//
// Exempt from the maintenance check for the same reason: this is the endpoint
// that tells the browser maintenance is on.
func (h *SettingsHandler) Public(c *gin.Context) {
	settings, err := h.settings.Get(c.Request.Context())
	if err != nil {
		logger.Errorf("read public settings: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load the site configuration")
		return
	}
	response.OK(c, "Site configuration", settings.Public())
}
