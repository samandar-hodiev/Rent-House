package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// AdminHandler serves the dashboard's own endpoints. HTTP concerns only: every
// rule about who may do what lives in the service.
type AdminHandler struct {
	admins *service.AdminService
}

func NewAdminHandler(admins *service.AdminService) *AdminHandler {
	return &AdminHandler{admins: admins}
}

// Login handles POST /api/v1/admin/auth/login.
func (h *AdminHandler) Login(c *gin.Context) {
	var req dto.AdminLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	req.Normalize()

	session, err := h.admins.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrAdminCredentials):
			// One message for a wrong password and for an unknown address.
			response.Error(c, http.StatusUnauthorized, "invalid_credentials",
				"Invalid credentials")
		case errors.Is(err, service.ErrAdminSuspended):
			response.Error(c, http.StatusForbidden, "account_suspended",
				"This account is suspended")
		case errors.Is(err, service.ErrAdminInactive):
			response.Error(c, http.StatusForbidden, "account_inactive",
				"This account is not active")
		default:
			logger.Errorf("admin login: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error",
				"Could not complete sign-in")
		}
		return
	}

	response.OK(c, "Signed in", dto.AdminSessionResponse{
		Admin:       dto.NewAdminResponse(session.Admin),
		AccessToken: session.Token,
		TokenType:   "Bearer",
		ExpiresIn:   int64(time.Until(session.ExpiresAt).Seconds()),
	})
}

// Me handles GET /api/v1/admin/auth/me and runs behind AdminAuth.
//
// The session is re-checked on every call, so the client can ask "am I still
// signed in" on a page load and get a truthful answer.
func (h *AdminHandler) Me(c *gin.Context) {
	admin, ok := middleware.AdminFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	response.OK(c, "Authenticated admin", dto.NewAdminResponse(admin))
}

// Logout handles POST /api/v1/admin/auth/logout.
//
// The token is a signed, stateless JWT, so there is nothing on the server to
// tear down: the client discards it and the session is over. The endpoint
// exists so the client has one call to make, and so a token denylist can be
// added here later without the frontend changing.
func (h *AdminHandler) Logout(c *gin.Context) {
	response.OK(c, "Signed out", nil)
}

// List handles GET /api/v1/admin/admins.
func (h *AdminHandler) List(c *gin.Context) {
	admins, err := h.admins.List(c.Request.Context())
	if err != nil {
		logger.Errorf("list admins: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load administrators")
		return
	}
	response.OK(c, "Administrators", dto.NewAdminResponses(admins))
}

// Create handles POST /api/v1/admin/admins.
func (h *AdminHandler) Create(c *gin.Context) {
	actor, ok := middleware.AdminFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	var req dto.CreateAdminRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	req.Normalize()

	admin, err := h.admins.Create(c.Request.Context(), actor, service.CreateInput{
		Name: req.Name, Email: req.Email, Role: req.Role, Password: req.Password,
	})
	if err != nil {
		h.writeAdminError(c, err, "create admin")
		return
	}

	response.Success(c, http.StatusCreated, "Administrator created", dto.NewAdminResponse(admin))
}

// SetStatus handles PATCH /api/v1/admin/admins/:id/status.
func (h *AdminHandler) SetStatus(c *gin.Context) {
	actor, id, ok := h.actorAndTarget(c)
	if !ok {
		return
	}

	var req dto.UpdateAdminStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}

	if err := h.admins.SetStatus(c.Request.Context(), actor, id, req.Status); err != nil {
		h.writeAdminError(c, err, "set admin status")
		return
	}
	response.OK(c, "Status updated", nil)
}

// Delete handles DELETE /api/v1/admin/admins/:id.
func (h *AdminHandler) Delete(c *gin.Context) {
	actor, id, ok := h.actorAndTarget(c)
	if !ok {
		return
	}

	if err := h.admins.Delete(c.Request.Context(), actor, id); err != nil {
		h.writeAdminError(c, err, "delete admin")
		return
	}
	response.OK(c, "Administrator removed", nil)
}

// Sidebar handles GET /api/v1/admin/sidebar.
//
// Readable by any administrator, because the dashboard needs it to draw its own
// navigation. Writing it is the owner's alone.
func (h *AdminHandler) Sidebar(c *gin.Context) {
	sections, err := h.admins.Sections(c.Request.Context())
	if err != nil {
		logger.Errorf("read sidebar sections: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load the sidebar configuration")
		return
	}
	response.OK(c, "Sidebar configuration", gin.H{"sections": sections})
}

// UpdateSidebar handles PUT /api/v1/admin/sidebar.
func (h *AdminHandler) UpdateSidebar(c *gin.Context) {
	actor, ok := middleware.AdminFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	var req dto.UpdateSidebarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}

	if err := h.admins.SetSections(c.Request.Context(), actor, req.Sections); err != nil {
		h.writeAdminError(c, err, "update sidebar")
		return
	}

	sections, err := h.admins.Sections(c.Request.Context())
	if err != nil {
		logger.Errorf("read sidebar sections: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load the sidebar configuration")
		return
	}
	response.OK(c, "Sidebar configuration updated", gin.H{"sections": sections})
}

// actorAndTarget pulls the caller and the :id out of a request, reporting the
// failure itself so each handler does not repeat it.
func (h *AdminHandler) actorAndTarget(c *gin.Context) (*models.Admin, uuid.UUID, bool) {
	found, exists := middleware.AdminFrom(c)
	if !exists {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return nil, uuid.Nil, false
	}

	parsed, err := uuid.Parse(c.Param("id"))
	if err != nil || parsed == uuid.Nil {
		response.Error(c, http.StatusBadRequest, "invalid_id", "Invalid administrator id")
		return nil, uuid.Nil, false
	}
	return found, parsed, true
}

// writeAdminError maps a service error onto a status and a message.
func (h *AdminHandler) writeAdminError(c *gin.Context, err error, action string) {
	switch {
	case errors.Is(err, service.ErrAdminForbidden):
		response.Error(c, http.StatusForbidden, "forbidden",
			"This action is reserved for the owner")
	case errors.Is(err, service.ErrOwnerImmutable):
		response.Error(c, http.StatusForbidden, "owner_immutable",
			"The owner account cannot be changed this way")
	case errors.Is(err, service.ErrOwnerAlreadyExists):
		response.Error(c, http.StatusConflict, "owner_exists",
			"The system already has an owner")
	case errors.Is(err, service.ErrAdminEmailTaken):
		response.Error(c, http.StatusConflict, "email_taken",
			"That email already belongs to an administrator")
	case errors.Is(err, service.ErrAdminNotFound):
		response.Error(c, http.StatusNotFound, "not_found", "Administrator not found")
	case errors.Is(err, service.ErrInvalidAdminRole):
		response.Error(c, http.StatusBadRequest, "invalid_role", "Invalid role")
	case errors.Is(err, service.ErrInvalidAdminStatus):
		response.Error(c, http.StatusBadRequest, "invalid_status", "Invalid status")
	default:
		logger.Errorf("%s: %v", action, err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not complete the request")
	}
}
