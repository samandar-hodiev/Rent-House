package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// ReportHandler serves complaints about listings: raising one, and — on the
// dashboard's side — reading and answering them.
type ReportHandler struct {
	reports *service.ReportService
	admins  *service.AdminService
}

func NewReportHandler(reports *service.ReportService, admins *service.AdminService) *ReportHandler {
	return &ReportHandler{reports: reports, admins: admins}
}

// Create handles POST /api/v1/apartments/:id/reports.
//
// Authenticated: an anonymous complaint cannot be answered, cannot be limited
// to one per listing, and is the easiest thing in the world to send a thousand
// of.
func (h *ReportHandler) Create(c *gin.Context) {
	reporterID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	apartmentID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	var req dto.CreateReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}

	report, err := h.reports.Create(
		c.Request.Context(), apartmentID, reporterID, req.Reason, req.Comment)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrApartmentNotFound):
			response.Error(c, http.StatusNotFound, "apartment_not_found", "Apartment not found")
		case errors.Is(err, service.ErrCannotReportOwnListing):
			response.Error(c, http.StatusForbidden, "own_listing",
				"You cannot report your own listing")
		case errors.Is(err, service.ErrAlreadyReported):
			// 409: the complaint exists, and a second one from the same
			// account is not more information.
			response.Error(c, http.StatusConflict, "already_reported",
				"You have already reported this listing")
		case errors.Is(err, service.ErrInvalidReportReason):
			response.Error(c, http.StatusBadRequest, "invalid_reason", "Unknown reason")
		default:
			logger.Errorf("create report: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error",
				"Could not send the report")
		}
		return
	}

	response.Success(c, http.StatusCreated, "Report received", dto.NewReportResponse(report))
}

// List handles GET /api/v1/admin/reports.
func (h *ReportHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	limit, _ := strconv.Atoi(c.Query("limit"))

	result, err := h.reports.List(c.Request.Context(), c.Query("status"), c.Query("search"), page, limit)
	if err != nil {
		if errors.Is(err, service.ErrInvalidReportStatus) {
			response.Error(c, http.StatusBadRequest, "invalid_status", "Invalid status filter")
			return
		}
		logger.Errorf("list reports: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load reports")
		return
	}

	response.OK(c, "Reports", gin.H{
		"reports": dto.NewReportRows(result.Reports),
		"counts":  result.Counts,
		"total":   result.Total,
		"page":    result.Page,
		"limit":   result.Limit,
	})
}

// SetStatus handles PATCH /api/v1/admin/reports/:id.
func (h *ReportHandler) SetStatus(c *gin.Context) {
	actor, ok := middleware.AdminFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusNotFound, "not_found", "Report not found")
		return
	}

	var req dto.UpdateReportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}

	report, err := h.reports.SetStatus(c.Request.Context(), id, req.Status, req.Resolution, actor.ID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrReportNotFound):
			response.Error(c, http.StatusNotFound, "not_found", "Report not found")
		case errors.Is(err, service.ErrInvalidReportStatus):
			response.Error(c, http.StatusBadRequest, "invalid_status", "Invalid status")
		default:
			logger.Errorf("update report: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error",
				"Could not update the report")
		}
		return
	}

	// What was decided and about which complaint, in the same log as every
	// other administrator action.
	// The listing is what a reader of the log will recognise; the complaint's
	// own id means nothing to anybody scanning the page.
	h.admins.Audit(c.Request.Context(), actor, models.AuditReportHandled,
		fmt.Sprintf("%s -> %s", report.ApartmentID, report.Status),
		c.ClientIP(), models.AuditSuccess)

	response.OK(c, "Report updated", dto.NewReportResponse(report))
}
