package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

// NotificationService writes and reads what people should know about.
//
// Every write is best-effort: a notification is a courtesy about something that
// has already happened, and failing to record one must never fail the thing it
// was about. A listing that was published stays published even if nobody could
// be told.
type NotificationService struct {
	notifications *repository.NotificationRepository
	settings      *SettingsService
	now           func() time.Time
}

func NewNotificationService(
	notifications *repository.NotificationRepository, settings *SettingsService,
) *NotificationService {
	return &NotificationService{notifications: notifications, settings: settings, now: time.Now}
}

// SetClock replaces the service's clock. Tests only.
func (s *NotificationService) SetClock(now func() time.Time) { s.now = now }

// enabled reports whether this kind of notification is switched on.
//
// Checked before anything is written rather than before anything is shown: a
// notification that is off should leave no trace, because a row nobody will
// ever read is a row that only makes an unread badge wrong.
func (s *NotificationService) enabled(ctx context.Context, kind string) bool {
	if s.settings == nil {
		return true
	}
	site := s.settings.MustGet(ctx)

	switch kind {
	case models.NotificationListingPending:
		return site.NotifyNewListing
	case models.NotificationReportCreated:
		return site.NotifyNewReport
	case models.NotificationUserRegistered:
		return site.NotifyNewRegistration
	case models.NotificationListingModerated:
		return site.NotifyModeration
	default:
		return true
	}
}

// NotifyAdmins tells every active administrator about something.
func (s *NotificationService) NotifyAdmins(
	ctx context.Context, kind, entityType string, entityID uuid.UUID, payload models.JSONMap,
) {
	if s == nil || !s.enabled(ctx, kind) {
		return
	}

	admins, err := s.notifications.AdminIDs(ctx)
	if err != nil {
		logger.Errorf("notify admins: %v", err)
		return
	}

	rows := make([]models.Notification, 0, len(admins))
	for _, adminID := range admins {
		id := entityID
		rows = append(rows, models.Notification{
			Audience:    models.AudienceAdmin,
			RecipientID: adminID,
			Type:        kind,
			Payload:     payload,
			EntityType:  entityType,
			EntityID:    &id,
		})
	}
	if err := s.notifications.CreateMany(ctx, rows); err != nil {
		logger.Errorf("notify admins: %v", err)
	}
}

// NotifyUser tells one marketplace account about something.
func (s *NotificationService) NotifyUser(
	ctx context.Context, userID uuid.UUID,
	kind, entityType string, entityID uuid.UUID, payload models.JSONMap,
) {
	if s == nil || !s.enabled(ctx, kind) {
		return
	}
	id := entityID
	err := s.notifications.CreateMany(ctx, []models.Notification{{
		Audience:    models.AudienceUser,
		RecipientID: userID,
		Type:        kind,
		Payload:     payload,
		EntityType:  entityType,
		EntityID:    &id,
	}})
	if err != nil {
		logger.Errorf("notify user: %v", err)
	}
}

// NotificationPage is one page of somebody's feed.
type NotificationPage struct {
	Notifications []models.Notification
	Unread        int64
	Total         int64
	Page          int
	Limit         int
}

// List returns a recipient's feed.
func (s *NotificationService) List(
	ctx context.Context, audience string, recipientID uuid.UUID, unreadOnly bool, page, limit int,
) (*NotificationPage, error) {
	if page < 1 {
		page = 1
	}
	switch {
	case limit < 1:
		limit = Defaults().PaginationDefaultSize
		if s.settings != nil {
			limit = s.settings.MustGet(ctx).PaginationDefaultSize
		}
	case limit > 100:
		limit = 100
	}

	rows, total, err := s.notifications.List(ctx, audience, recipientID, unreadOnly, page, limit)
	if err != nil {
		return nil, err
	}
	unread, err := s.notifications.CountUnread(ctx, audience, recipientID)
	if err != nil {
		return nil, err
	}

	return &NotificationPage{
		Notifications: rows, Unread: unread, Total: total, Page: page, Limit: limit,
	}, nil
}

// MarkRead marks one notification as read for this recipient.
func (s *NotificationService) MarkRead(
	ctx context.Context, id uuid.UUID, audience string, recipientID uuid.UUID,
) error {
	return s.notifications.MarkRead(ctx, id, audience, recipientID, s.now().UTC())
}

// MarkAllRead clears the badge.
func (s *NotificationService) MarkAllRead(
	ctx context.Context, audience string, recipientID uuid.UUID,
) (int64, error) {
	return s.notifications.MarkAllRead(ctx, audience, recipientID, s.now().UTC())
}
