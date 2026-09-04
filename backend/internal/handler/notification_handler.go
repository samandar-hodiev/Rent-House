package handler

import (
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

// NotificationHandler serves both feeds: the dashboard's and the marketplace's.
//
// One handler because the two are the same endpoints with a different
// recipient, and the recipient comes from the token — never from the request,
// so nobody can read somebody else's feed by asking for it.
type NotificationHandler struct {
	notifications *service.NotificationService
}

func NewNotificationHandler(notifications *service.NotificationService) *NotificationHandler {
	return &NotificationHandler{notifications: notifications}
}

// recipient reads who is asking, from whichever token this route requires.
func (h *NotificationHandler) recipient(c *gin.Context, audience string) (uuid.UUID, bool) {
	if audience == models.AudienceAdmin {
		actor, ok := middleware.AdminFrom(c)
		if !ok {
			response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
			return uuid.Nil, false
		}
		return actor.ID, true
	}

	userID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return uuid.Nil, false
	}
	return userID, true
}

func (h *NotificationHandler) list(c *gin.Context, audience string) {
	recipientID, ok := h.recipient(c, audience)
	if !ok {
		return
	}

	page, _ := strconv.Atoi(c.Query("page"))
	limit, _ := strconv.Atoi(c.Query("limit"))
	unreadOnly := c.Query("unread") == "true"

	result, err := h.notifications.List(
		c.Request.Context(), audience, recipientID, unreadOnly, page, limit)
	if err != nil {
		logger.Errorf("list notifications: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not load notifications")
		return
	}

	response.OK(c, "Notifications", gin.H{
		"notifications": dto.NewNotificationResponses(result.Notifications),
		"unread":        result.Unread,
		"total":         result.Total,
		"page":          result.Page,
		"limit":         result.Limit,
	})
}

func (h *NotificationHandler) markRead(c *gin.Context, audience string) {
	recipientID, ok := h.recipient(c, audience)
	if !ok {
		return
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusNotFound, "not_found", "Notification not found")
		return
	}

	if err := h.notifications.MarkRead(c.Request.Context(), id, audience, recipientID); err != nil {
		logger.Errorf("mark notification read: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not update the notification")
		return
	}
	response.OK(c, "Notification read", nil)
}

func (h *NotificationHandler) markAllRead(c *gin.Context, audience string) {
	recipientID, ok := h.recipient(c, audience)
	if !ok {
		return
	}

	count, err := h.notifications.MarkAllRead(c.Request.Context(), audience, recipientID)
	if err != nil {
		logger.Errorf("mark all notifications read: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error",
			"Could not update the notifications")
		return
	}
	response.OK(c, "Notifications read", gin.H{"read": count})
}

// The dashboard's feed.
func (h *NotificationHandler) AdminList(c *gin.Context) { h.list(c, models.AudienceAdmin) }
func (h *NotificationHandler) AdminRead(c *gin.Context) { h.markRead(c, models.AudienceAdmin) }
func (h *NotificationHandler) AdminReadAll(c *gin.Context) {
	h.markAllRead(c, models.AudienceAdmin)
}

// The marketplace's.
func (h *NotificationHandler) UserList(c *gin.Context) { h.list(c, models.AudienceUser) }
func (h *NotificationHandler) UserRead(c *gin.Context) { h.markRead(c, models.AudienceUser) }
func (h *NotificationHandler) UserReadAll(c *gin.Context) {
	h.markAllRead(c, models.AudienceUser)
}
