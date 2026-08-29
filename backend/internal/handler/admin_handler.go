package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/internal/storage"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// AdminHandler serves the dashboard's own endpoints. HTTP concerns only: every
// rule about who may do what lives in the service.
type AdminHandler struct {
	admins   *service.AdminService
	stats    *service.AdminStatsService
	listings *service.AdminListingService
	files    storage.Storage
	// Where this server's uploads live, so an avatar can be checked to be one
	// of them rather than an address the client made up.
	uploadPath string
	// The public origin uploads are reachable at. Empty means "work it out from
	// the request", which is what development wants.
	baseURL string
}

func NewAdminHandler(
	admins *service.AdminService, stats *service.AdminStatsService,
	listings *service.AdminListingService,
	files storage.Storage, uploadPath, baseURL string,
) *AdminHandler {
	return &AdminHandler{
		admins:     admins,
		stats:      stats,
		listings:   listings,
		files:      files,
		uploadPath: uploadPath,
		baseURL:    strings.TrimRight(baseURL, "/"),
	}
}

// UploadAvatar handles POST /api/v1/admin/profile/avatar.
//
// Its own endpoint rather than the marketplace's uploader: that one requires a
// user token, and an administrator does not have one. Same storage, same
// allow-list, same ceiling — only the door is different.
//
// Uploading does not change the profile. It returns a URL, and PATCH /profile
// saves it, so a picture chosen and then abandoned leaves the account alone.
func (h *AdminHandler) UploadAvatar(c *gin.Context) {
	if _, ok := middleware.AdminFrom(c); !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	header, err := c.FormFile("image")
	if err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed",
			"Attach an image in the 'image' field")
		return
	}

	// Checked before the file is opened, so an oversized upload is refused
	// without being read.
	if header.Size > storage.MaxImageBytes {
		response.Error(c, http.StatusRequestEntityTooLarge, "file_too_large",
			"The image is larger than 5 MB")
		return
	}

	file, err := header.Open()
	if err != nil {
		logger.Errorf("upload avatar: open: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return
	}
	defer file.Close()

	// The browser's declared type is a hint; storage re-checks it against its
	// allow-list and decides the extension itself.
	path, err := h.files.Save(c.Request.Context(), header.Header.Get("Content-Type"), file)
	if err != nil {
		if errors.Is(err, storage.ErrUnsupportedType) {
			response.Error(c, http.StatusUnsupportedMediaType, "unsupported_type",
				"Only JPEG, PNG and WebP images are accepted")
			return
		}
		logger.Errorf("upload avatar: save: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return
	}

	response.Success(c, http.StatusCreated, "Image uploaded", gin.H{"url": h.absolute(c, path)})
}

// absolute turns a stored path into a full URL, so a frontend on another origin
// can load it.
func (h *AdminHandler) absolute(c *gin.Context, path string) string {
	if h.baseURL != "" {
		return h.baseURL + path
	}
	scheme := "http"
	if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + c.Request.Host + path
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
		// Recorded with the address that was tried rather than an account,
		// because a refused attempt may not correspond to one.
		h.admins.Audit(c.Request.Context(), nil,
			models.AuditSignInFailed, req.Email, c.ClientIP(), models.AuditFailed)
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

	h.admins.Audit(c.Request.Context(), session.Admin,
		models.AuditSignIn, session.Admin.Email, c.ClientIP(), models.AuditSuccess)

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

	h.admins.Audit(c.Request.Context(), actor,
		models.AuditAdminCreated, admin.Email, c.ClientIP(), models.AuditSuccess)

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
	h.admins.Audit(c.Request.Context(), actor,
		models.AuditAdminStatus, id.String()+" -> "+req.Status, c.ClientIP(), models.AuditSuccess)

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
	h.admins.Audit(c.Request.Context(), actor,
		models.AuditAdminDeleted, id.String(), c.ClientIP(), models.AuditSuccess)

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
	h.admins.Audit(c.Request.Context(), actor,
		models.AuditSidebarChanged, "", c.ClientIP(), models.AuditSuccess)

	response.OK(c, "Sidebar configuration updated", gin.H{"sections": sections})
}

// DashboardStats handles GET /api/v1/admin/dashboard/stats.
func (h *AdminHandler) DashboardStats(c *gin.Context) {
	overview, err := h.stats.Overview(c.Request.Context())
	if err != nil {
		logger.Errorf("dashboard stats: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load the statistics")
		return
	}
	response.OK(c, "Dashboard statistics", overview)
}

// DashboardGrowth handles GET /api/v1/admin/dashboard/growth.
//
// Both charts at all three granularities in one answer. The series are small,
// and sending them together means switching between daily and monthly is
// instant rather than another round trip.
func (h *AdminHandler) DashboardGrowth(c *gin.Context) {
	growth, err := h.stats.Growth(c.Request.Context())
	if err != nil {
		logger.Errorf("dashboard growth: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load the statistics")
		return
	}
	response.OK(c, "Growth", growth)
}

// DashboardDistricts handles GET /api/v1/admin/dashboard/districts.
func (h *AdminHandler) DashboardDistricts(c *gin.Context) {
	districts, err := h.stats.Districts(c.Request.Context())
	if err != nil {
		logger.Errorf("dashboard districts: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load the statistics")
		return
	}
	response.OK(c, "District activity", gin.H{"districts": districts})
}

// Listings handles GET /api/v1/admin/listings.
func (h *AdminHandler) Listings(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	limit, _ := strconv.Atoi(c.Query("limit"))

	result, err := h.listings.List(
		c.Request.Context(), c.Query("status"), c.Query("search"), page, limit,
	)
	if err != nil {
		if errors.Is(err, service.ErrInvalidAdminStatus) {
			response.Error(c, http.StatusBadRequest, "invalid_status", "Invalid status filter")
			return
		}
		logger.Errorf("list listings: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load listings")
		return
	}

	listings := make([]dto.AdminListingResponse, 0, len(result.Listings))
	for i := range result.Listings {
		listings = append(listings, dto.NewAdminListingResponse(&result.Listings[i]))
	}
	totalPages := int((result.Total + int64(result.Limit) - 1) / int64(result.Limit))
	if totalPages < 1 {
		totalPages = 1
	}

	response.OK(c, "Listings", dto.AdminListingListResponse{
		Listings:   listings,
		Total:      result.Total,
		Page:       result.Page,
		Limit:      result.Limit,
		TotalPages: totalPages,
	})
}

// ListingDetail handles GET /api/v1/admin/listings/:id.
func (h *AdminHandler) ListingDetail(c *gin.Context) {
	id, ok := h.listingID(c)
	if !ok {
		return
	}

	detail, err := h.listings.Detail(c.Request.Context(), id)
	if err != nil {
		h.writeListingError(c, err, "listing detail")
		return
	}
	response.OK(c, "Listing", dto.NewAdminListingDetailResponse(
		detail.Listing, detail.Images, detail.Stats,
	))
}

// ListingImages handles GET /api/v1/admin/listings/:id/images.
//
// Its own endpoint because the gallery is opened on its own, from the table,
// without the rest of the card being wanted.
func (h *AdminHandler) ListingImages(c *gin.Context) {
	id, ok := h.listingID(c)
	if !ok {
		return
	}

	images, err := h.listings.Images(c.Request.Context(), id)
	if err != nil {
		h.writeListingError(c, err, "listing images")
		return
	}
	response.OK(c, "Listing images", gin.H{"images": images})
}

// ListingChats handles GET /api/v1/admin/listings/:id/chats.
//
// The owner's alone. A super admin calling this directly receives 403 — the
// service refuses before a single message is read, so hiding the link in the
// interface is a courtesy rather than the protection.
func (h *AdminHandler) ListingChats(c *gin.Context) {
	actor, exists := middleware.AdminFrom(c)
	if !exists {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	id, ok := h.listingID(c)
	if !ok {
		return
	}

	chats, err := h.listings.Chats(c.Request.Context(), actor, id)
	if err != nil {
		h.writeListingError(c, err, "listing chats")
		return
	}
	response.OK(c, "Listing chats", gin.H{"chats": dto.NewAdminChatPreviews(chats)})
}

// ListingAudit handles GET /api/v1/admin/listings/:id/audit.
//
// Every conversation held about this listing's owner's listings, with the full
// text of every message — including messages the participants withdrew. The
// owner's alone, refused in the service before a single row is read.
func (h *AdminHandler) ListingAudit(c *gin.Context) {
	actor, exists := middleware.AdminFrom(c)
	if !exists {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	id, ok := h.listingID(c)
	if !ok {
		return
	}

	audit, err := h.listings.AuditConversations(c.Request.Context(), actor, id)
	if err != nil {
		h.writeListingError(c, err, "listing audit")
		return
	}

	response.OK(c, "Conversation audit", gin.H{
		"conversations": dto.NewAdminAuditConversations(audit.Conversations, audit.Messages),
	})
}

func (h *AdminHandler) listingID(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil || id == uuid.Nil {
		response.Error(c, http.StatusBadRequest, "invalid_id", "Invalid listing id")
		return uuid.Nil, false
	}
	return id, true
}

func (h *AdminHandler) writeListingError(c *gin.Context, err error, action string) {
	switch {
	case errors.Is(err, service.ErrAdminForbidden):
		response.Error(c, http.StatusForbidden, "forbidden",
			"This action is reserved for the owner")
	case errors.Is(err, service.ErrListingNotFound):
		response.Error(c, http.StatusNotFound, "not_found", "Listing not found")
	default:
		logger.Errorf("%s: %v", action, err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not complete the request")
	}
}

// Chats handles GET /api/v1/admin/chats.
func (h *AdminHandler) Chats(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	limit, _ := strconv.Atoi(c.Query("limit"))

	result, err := h.listings.AllChats(c.Request.Context(), c.Query("search"), page, limit)
	if err != nil {
		logger.Errorf("list chats: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load conversations")
		return
	}

	totalPages := int((result.Total + int64(result.Limit) - 1) / int64(result.Limit))
	if totalPages < 1 {
		totalPages = 1
	}
	response.OK(c, "Conversations", dto.AdminChatListResponse{
		Chats:      dto.NewAdminChatResponses(result.Chats),
		Total:      result.Total,
		Page:       result.Page,
		Limit:      result.Limit,
		TotalPages: totalPages,
	})
}

// ChatMessages handles GET /api/v1/admin/chats/:id/messages.
//
// The owner's alone: it returns what people wrote to each other, withdrawn
// messages included. Moderating the marketplace does not by itself entitle
// somebody to read everybody's correspondence.
func (h *AdminHandler) ChatMessages(c *gin.Context) {
	actor, exists := middleware.AdminFrom(c)
	if !exists {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil || id == uuid.Nil {
		response.Error(c, http.StatusBadRequest, "invalid_id", "Invalid conversation id")
		return
	}

	thread, err := h.listings.ChatMessages(c.Request.Context(), actor, id)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrAdminForbidden):
			response.Error(c, http.StatusForbidden, "forbidden",
				"This action is reserved for the owner")
		case errors.Is(err, service.ErrConversationNotFound):
			response.Error(c, http.StatusNotFound, "not_found", "Conversation not found")
		default:
			logger.Errorf("chat messages: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error",
				"Could not load the conversation")
		}
		return
	}

	response.OK(c, "Conversation", gin.H{
		"buyer_name":  thread.Buyer,
		"seller_name": thread.Seller,
		"messages":    dto.NewAdminAuditMessages(thread.Messages),
	})
}

// Users handles GET /api/v1/admin/users.
//
// Searching, filtering and paging are all query parameters and all applied by
// PostgreSQL. The client sends what it wants and receives one page plus the
// totals; it never receives every account and narrows them itself.
func (h *AdminHandler) Users(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	limit, _ := strconv.Atoi(c.Query("limit"))

	result, err := h.admins.Users(
		c.Request.Context(), c.Query("search"), c.Query("status"), page, limit,
	)
	if err != nil {
		if errors.Is(err, service.ErrInvalidAdminStatus) {
			response.Error(c, http.StatusBadRequest, "invalid_status", "Invalid status filter")
			return
		}
		logger.Errorf("list users: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load users")
		return
	}

	users := make([]dto.AdminUserResponse, 0, len(result.Users))
	for i := range result.Users {
		row := &result.Users[i]
		users = append(users, dto.NewAdminUserResponse(
			&row.User, row.Listings, row.BlockReason, row.BlockedAt, row.BlockedByName,
		))
	}

	totalPages := int((result.Total + int64(result.Limit) - 1) / int64(result.Limit))
	if totalPages < 1 {
		totalPages = 1
	}

	response.OK(c, "Users", dto.AdminUserListResponse{
		Users:      users,
		Total:      result.Total,
		Page:       result.Page,
		Limit:      result.Limit,
		TotalPages: totalPages,
	})
}

// UserDetail handles GET /api/v1/admin/users/:id.
func (h *AdminHandler) UserDetail(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil || id == uuid.Nil {
		response.Error(c, http.StatusBadRequest, "invalid_id", "Invalid user id")
		return
	}

	detail, err := h.admins.User(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrAdminNotFound) {
			response.Error(c, http.StatusNotFound, "not_found", "User not found")
			return
		}
		logger.Errorf("user detail: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load the user")
		return
	}
	response.OK(c, "User", dto.NewAdminUserDetailResponse(detail.User, detail.History))
}

// AuditLogs handles GET /api/v1/admin/audit-logs.
func (h *AdminHandler) AuditLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	limit, _ := strconv.Atoi(c.Query("limit"))

	result, err := h.admins.AuditLogs(c.Request.Context(), page, limit)
	if err != nil {
		logger.Errorf("audit logs: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load the audit log")
		return
	}

	totalPages := int((result.Total + int64(result.Limit) - 1) / int64(result.Limit))
	if totalPages < 1 {
		totalPages = 1
	}
	response.OK(c, "Audit log", gin.H{
		"entries":     result.Entries,
		"total":       result.Total,
		"page":        result.Page,
		"limit":       result.Limit,
		"total_pages": totalPages,
	})
}

// Permissions handles GET /api/v1/admin/permissions.
//
// What each role may actually reach, derived from the rules the middleware
// enforces and the configuration the owner set — so the table cannot claim a
// permission the server would refuse.
func (h *AdminHandler) Permissions(c *gin.Context) {
	rows, err := h.admins.Permissions(c.Request.Context())
	if err != nil {
		logger.Errorf("permissions: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load permissions")
		return
	}
	response.OK(c, "Permissions", gin.H{"permissions": rows})
}

// SetUserStatus handles PATCH /api/v1/admin/users/:id/status.
func (h *AdminHandler) SetUserStatus(c *gin.Context) {
	actor, ok := middleware.AdminFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil || id == uuid.Nil {
		response.Error(c, http.StatusBadRequest, "invalid_id", "Invalid user id")
		return
	}

	var req dto.UpdateUserStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}

	if err := h.admins.SetUserStatus(
		c.Request.Context(), actor, id, req.Status, req.Reason,
	); err != nil {
		switch {
		case errors.Is(err, service.ErrBlockReasonRequired):
			response.Error(c, http.StatusBadRequest, "reason_required",
				"A reason is required to block an account")
		case errors.Is(err, service.ErrAdminNotFound):
			response.Error(c, http.StatusNotFound, "not_found", "User not found")
		case errors.Is(err, service.ErrInvalidAdminStatus):
			response.Error(c, http.StatusBadRequest, "invalid_status", "Invalid status")
		default:
			logger.Errorf("set user status: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error",
				"Could not update the user")
		}
		return
	}
	action := models.AuditUserUnblocked
	if req.Status == models.UserStatusBlocked {
		action = models.AuditUserBlocked
	}
	h.admins.Audit(c.Request.Context(), actor, action, id.String(), c.ClientIP(), models.AuditSuccess)

	response.OK(c, "User updated", nil)
}

// UpdateProfile handles PATCH /api/v1/admin/profile.
//
// The account edited is the one the token names. There is no id in the path or
// the body, so this cannot be aimed at another administrator.
func (h *AdminHandler) UpdateProfile(c *gin.Context) {
	actor, ok := middleware.AdminFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	var req dto.UpdateAdminProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
		return
	}
	req.Normalize()

	// A picture must be one this server stored. Without the check, a client
	// could point the avatar at any address on the internet and every viewer's
	// browser would fetch it — a tracking pixel with an audience.
	if req.AvatarURL != nil && *req.AvatarURL != "" && !h.isOwnUpload(*req.AvatarURL) {
		response.Error(c, http.StatusBadRequest, "invalid_avatar",
			"Upload the image first, then save the profile")
		return
	}

	admin, err := h.admins.UpdateProfile(c.Request.Context(), actor, req.Name, req.AvatarURL)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrNameRequired):
			response.Error(c, http.StatusBadRequest, "validation_failed", "Name cannot be empty")
		case errors.Is(err, service.ErrAdminNotFound):
			response.Error(c, http.StatusUnauthorized, "invalid_token", "Invalid token")
		default:
			logger.Errorf("update admin profile: %v", err)
			response.Error(c, http.StatusInternalServerError, "internal_error",
				"Could not save the profile")
		}
		return
	}
	h.admins.Audit(c.Request.Context(), actor,
		models.AuditProfileUpdated, admin.Email, c.ClientIP(), models.AuditSuccess)

	response.OK(c, "Profile updated", dto.NewAdminResponse(admin))
}

// isOwnUpload reports whether a URL points at a file this server stored.
//
// Both forms are accepted: the absolute URL the uploader hands back, and the
// bare path, which is what an older record may hold. Anything else is somebody
// else's address.
func (h *AdminHandler) isOwnUpload(url string) bool {
	if strings.HasPrefix(url, h.uploadPath) {
		return true
	}
	marker := h.uploadPath + "/"
	if index := strings.Index(url, marker); index > 0 {
		// Only after a scheme and host, never as a suffix of another path.
		return strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://")
	}
	return false
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
