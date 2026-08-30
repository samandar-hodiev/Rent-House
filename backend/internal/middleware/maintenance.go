package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// MaintenanceCode is what a refused request carries, so the frontend can tell a
// closed marketplace apart from a broken one and show the notice instead of an
// error.
const MaintenanceCode = "maintenance_mode"

// Maintenance closes the marketplace to everybody but its administrators.
//
// At the API, not only in the router: a frontend route guard stops a browser
// from drawing a page, and stops nothing else. With this in place a closed
// marketplace is closed to a script, a cached tab and a mobile client too.
//
// Applied to the whole of /api/v1 with a short list of exemptions, rather than
// to each public group in turn — an endpoint added later is then closed by
// default, which is the safer way round for a switch whose job is closing
// things.
func Maintenance(settings *service.SettingsService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if maintenanceExempt(c.Request.URL.Path) {
			c.Next()
			return
		}

		current := settings.MustGet(c.Request.Context())
		if !current.MaintenanceMode {
			c.Next()
			return
		}

		message := strings.TrimSpace(current.MaintenanceMessage)
		if message == "" {
			message = "Saytda texnik ishlar olib borilmoqda."
		}
		// 503 rather than 403: the marketplace is unavailable, not forbidding
		// this caller in particular, and a proxy or a crawler reading only the
		// status should understand it as temporary.
		response.Error(c, http.StatusServiceUnavailable, MaintenanceCode, message)
		c.Abort()
	}
}

// maintenanceExempt lists what stays reachable while the marketplace is closed.
func maintenanceExempt(path string) bool {
	// The dashboard, in full. Administrators are how maintenance gets turned
	// off again, so locking them out would be a switch with no way back.
	if strings.HasPrefix(path, "/api/v1/admin") {
		return true
	}
	// The public configuration itself: this is the endpoint that tells a
	// browser maintenance is on and carries the message to show.
	if path == "/api/v1/settings" {
		return true
	}
	// The API's own root, which is a health check.
	return path == "/api/v1" || path == "/api/v1/"
}
