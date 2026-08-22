package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// BlockHandler serves the block relationship.
//
// The blocker is always the authenticated caller. There is no id in any of
// these routes naming who is doing the blocking, so "block on somebody else's
// behalf" is not a request that can be spelled.
type BlockHandler struct {
	chat *service.ChatService
}

func NewBlockHandler(chat *service.ChatService) *BlockHandler {
	return &BlockHandler{chat: chat}
}

// Block handles POST /api/v1/me/blocks/:userId.
func (h *BlockHandler) Block(c *gin.Context) {
	actorID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	targetID, ok := parseUUIDParam(c, "userId")
	if !ok {
		return
	}

	// An absent body is a block with no reason, which is allowed.
	var req dto.BlockUserRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			response.Error(c, http.StatusBadRequest, "validation_failed", validationMessage(err))
			return
		}
	}

	err := h.chat.Block(c.Request.Context(), actorID, targetID,
		optionalString(req.Reason), optionalString(req.ReasonText))

	switch {
	case err == nil:
		response.OK(c, "", dto.BlockStateResponse{IsBlocked: true})
	case errors.Is(err, service.ErrCannotBlockSelf):
		response.Error(c, http.StatusBadRequest, "cannot_block_self", "You cannot block yourself")
	case errors.Is(err, service.ErrUserNotFound):
		response.Error(c, http.StatusNotFound, "user_not_found", "User not found")
	default:
		logger.Errorf("block user: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
	}
}

// Unblock handles DELETE /api/v1/me/blocks/:userId.
func (h *BlockHandler) Unblock(c *gin.Context) {
	actorID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	targetID, ok := parseUUIDParam(c, "userId")
	if !ok {
		return
	}

	if err := h.chat.Unblock(c.Request.Context(), actorID, targetID); err != nil {
		logger.Errorf("unblock user: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return
	}
	response.OK(c, "", dto.BlockStateResponse{IsBlocked: false})
}

// State handles GET /api/v1/me/blocks/:userId.
func (h *BlockHandler) State(c *gin.Context) {
	actorID, ok := middleware.UserIDFrom(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}
	targetID, ok := parseUUIDParam(c, "userId")
	if !ok {
		return
	}

	state, err := h.chat.BlockState(c.Request.Context(), actorID, targetID)
	if err != nil {
		logger.Errorf("block state: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return
	}
	response.OK(c, "", dto.BlockStateResponse{
		IsBlocked:   state.IBlockedThem,
		IsBlockedBy: state.TheyBlockedMe,
	})
}

// optionalString turns an empty field into an absent one, so "no reason given"
// is stored as null rather than as an empty string.
func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
