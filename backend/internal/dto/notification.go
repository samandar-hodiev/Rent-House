package dto

import (
	"time"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// NotificationResponse is one notification as the API returns it.
//
// No sentence, deliberately: the type and the payload are what the client
// renders, in the language its reader chose. A rendered sentence would be
// frozen in the language of the moment it was created.
type NotificationResponse struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	Payload    map[string]any `json:"payload"`
	EntityType string         `json:"entity_type,omitempty"`
	EntityID   string         `json:"entity_id,omitempty"`
	Read       bool           `json:"read"`
	CreatedAt  time.Time      `json:"created_at"`
}

func NewNotificationResponse(notification models.Notification) NotificationResponse {
	out := NotificationResponse{
		ID:         notification.ID.String(),
		Type:       notification.Type,
		Payload:    notification.Payload,
		EntityType: notification.EntityType,
		Read:       notification.ReadAt != nil,
		CreatedAt:  notification.CreatedAt,
	}
	if out.Payload == nil {
		out.Payload = map[string]any{}
	}
	if notification.EntityID != nil {
		out.EntityID = notification.EntityID.String()
	}
	return out
}

func NewNotificationResponses(rows []models.Notification) []NotificationResponse {
	out := make([]NotificationResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, NewNotificationResponse(row))
	}
	return out
}
