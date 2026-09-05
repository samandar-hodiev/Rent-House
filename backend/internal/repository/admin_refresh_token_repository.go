package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// ErrAdminRefreshTokenNotFound is a token this server never issued for the
// dashboard, or one that has been swept. As with the marketplace's equivalent,
// the service turns this into the same answer as an expired or revoked one.
var ErrAdminRefreshTokenNotFound = errors.New("admin refresh token not found")

// AdminRefreshTokenRepository stores the dashboard sessions an admin has open.
// It mirrors RefreshTokenRepository method for method; see there for why each
// one is shaped the way it is.
type AdminRefreshTokenRepository struct {
	db *gorm.DB
}

func NewAdminRefreshTokenRepository(db *gorm.DB) *AdminRefreshTokenRepository {
	return &AdminRefreshTokenRepository{db: db}
}

// Create stores one session.
func (r *AdminRefreshTokenRepository) Create(ctx context.Context, token *models.AdminRefreshToken) error {
	if err := r.db.WithContext(ctx).Create(token).Error; err != nil {
		return fmt.Errorf("create admin refresh token: %w", err)
	}
	return nil
}

// FindByHash loads a session by the digest of its secret, revoked or not.
func (r *AdminRefreshTokenRepository) FindByHash(
	ctx context.Context, hash string,
) (*models.AdminRefreshToken, error) {
	var token models.AdminRefreshToken
	err := r.db.WithContext(ctx).Where("token_hash = ?", hash).First(&token).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return nil, ErrAdminRefreshTokenNotFound
	case err != nil:
		return nil, fmt.Errorf("find admin refresh token: %w", err)
	}
	return &token, nil
}

// Rotate ends one session and starts its successor in a single transaction.
func (r *AdminRefreshTokenRepository) Rotate(
	ctx context.Context, oldID uuid.UUID, next *models.AdminRefreshToken, now time.Time,
) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(next).Error; err != nil {
			return fmt.Errorf("create admin refresh token: %w", err)
		}
		result := tx.Model(&models.AdminRefreshToken{}).
			Where("id = ? AND revoked_at IS NULL", oldID).
			Updates(map[string]any{"revoked_at": now, "replaced_by": next.ID})
		if result.Error != nil {
			return fmt.Errorf("revoke admin refresh token: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return ErrAdminRefreshTokenNotFound
		}
		return nil
	})
}

// Revoke ends one session.
func (r *AdminRefreshTokenRepository) Revoke(ctx context.Context, id uuid.UUID, now time.Time) error {
	err := r.db.WithContext(ctx).Model(&models.AdminRefreshToken{}).
		Where("id = ? AND revoked_at IS NULL", id).
		Update("revoked_at", now).Error
	if err != nil {
		return fmt.Errorf("revoke admin refresh token: %w", err)
	}
	return nil
}

// RevokeAllForAdmin ends every session an admin account has open. Used where a
// session is no longer trustworthy for reasons that have nothing to do with
// one token: the owner suspending or removing the account.
func (r *AdminRefreshTokenRepository) RevokeAllForAdmin(
	ctx context.Context, adminID uuid.UUID, now time.Time,
) (int64, error) {
	result := r.db.WithContext(ctx).Model(&models.AdminRefreshToken{}).
		Where("admin_id = ? AND revoked_at IS NULL", adminID).
		Update("revoked_at", now)
	if result.Error != nil {
		return 0, fmt.Errorf("revoke admin sessions: %w", result.Error)
	}
	return result.RowsAffected, nil
}

// DeleteExpired sweeps what can no longer be used, so the table stays
// proportional to the sessions that are actually open.
func (r *AdminRefreshTokenRepository) DeleteExpired(ctx context.Context, before time.Time) (int64, error) {
	result := r.db.WithContext(ctx).
		Where("expires_at < ?", before).Delete(&models.AdminRefreshToken{})
	if result.Error != nil {
		return 0, fmt.Errorf("sweep admin refresh tokens: %w", result.Error)
	}
	return result.RowsAffected, nil
}
