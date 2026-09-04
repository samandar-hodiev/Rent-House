package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// NotificationRepository stores what people should know about.
type NotificationRepository struct {
	db *gorm.DB
}

func NewNotificationRepository(db *gorm.DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

// CreateMany stores a batch, which is what fanning one event out to every
// administrator is. One statement rather than one per recipient.
func (r *NotificationRepository) CreateMany(
	ctx context.Context, notifications []models.Notification,
) error {
	if len(notifications) == 0 {
		return nil
	}
	if err := r.db.WithContext(ctx).Create(&notifications).Error; err != nil {
		return fmt.Errorf("create notifications: %w", err)
	}
	return nil
}

// AdminIDs is every administrator who can be told something.
//
// Suspended and inactive accounts are skipped: a notification nobody will read
// is a row that only makes the unread badge wrong when they come back.
func (r *NotificationRepository) AdminIDs(ctx context.Context) ([]uuid.UUID, error) {
	rows := []string{}
	err := r.db.WithContext(ctx).Model(&models.Admin{}).
		Where("status = ?", models.AdminStatusActive).
		Pluck("id::text", &rows).Error
	if err != nil {
		return nil, fmt.Errorf("list admin ids: %w", err)
	}

	ids := make([]uuid.UUID, 0, len(rows))
	for _, raw := range rows {
		if id, err := uuid.Parse(raw); err == nil {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

// List returns one page of somebody's notifications, newest first.
func (r *NotificationRepository) List(
	ctx context.Context, audience string, recipientID uuid.UUID, unreadOnly bool, page, limit int,
) ([]models.Notification, int64, error) {
	base := r.db.WithContext(ctx).Model(&models.Notification{}).
		Where("audience = ? AND recipient_id = ?", audience, recipientID)
	if unreadOnly {
		base = base.Where("read_at IS NULL")
	}

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count notifications: %w", err)
	}
	if total == 0 {
		return []models.Notification{}, 0, nil
	}

	if limit <= 0 {
		limit = 20
	}
	if page <= 0 {
		page = 1
	}

	rows := []models.Notification{}
	err := base.Order("created_at DESC").
		Limit(limit).Offset((page - 1) * limit).Find(&rows).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list notifications: %w", err)
	}
	return rows, total, nil
}

// CountUnread is the badge.
func (r *NotificationRepository) CountUnread(
	ctx context.Context, audience string, recipientID uuid.UUID,
) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&models.Notification{}).
		Where("audience = ? AND recipient_id = ? AND read_at IS NULL", audience, recipientID).
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("count unread: %w", err)
	}
	return count, nil
}

// MarkRead marks one notification, and only if it belongs to this recipient —
// the ownership check is in the WHERE rather than in a read beforehand, so
// there is no window between checking and writing.
func (r *NotificationRepository) MarkRead(
	ctx context.Context, id uuid.UUID, audience string, recipientID uuid.UUID, now time.Time,
) error {
	err := r.db.WithContext(ctx).Model(&models.Notification{}).
		Where("id = ? AND audience = ? AND recipient_id = ? AND read_at IS NULL",
			id, audience, recipientID).
		Update("read_at", now).Error
	if err != nil {
		return fmt.Errorf("mark notification read: %w", err)
	}
	return nil
}

// MarkAllRead clears somebody's badge.
func (r *NotificationRepository) MarkAllRead(
	ctx context.Context, audience string, recipientID uuid.UUID, now time.Time,
) (int64, error) {
	result := r.db.WithContext(ctx).Model(&models.Notification{}).
		Where("audience = ? AND recipient_id = ? AND read_at IS NULL", audience, recipientID).
		Update("read_at", now)
	if result.Error != nil {
		return 0, fmt.Errorf("mark all read: %w", result.Error)
	}
	return result.RowsAffected, nil
}
