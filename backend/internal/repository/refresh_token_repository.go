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

// ErrRefreshTokenNotFound is a token this server never issued, or one that has
// been swept. The service turns it into the same answer as an expired or
// revoked one: a caller must not learn which of the three it was.
var ErrRefreshTokenNotFound = errors.New("refresh token not found")

// RefreshTokenRepository stores the sessions a user has open.
type RefreshTokenRepository struct {
	db *gorm.DB
}

func NewRefreshTokenRepository(db *gorm.DB) *RefreshTokenRepository {
	return &RefreshTokenRepository{db: db}
}

// Create stores one session.
func (r *RefreshTokenRepository) Create(ctx context.Context, token *models.RefreshToken) error {
	if err := r.db.WithContext(ctx).Create(token).Error; err != nil {
		return fmt.Errorf("create refresh token: %w", err)
	}
	return nil
}

// FindByHash loads a session by the digest of its secret, revoked or not.
//
// Revoked rows are returned rather than filtered out: a token presented after
// it was rotated is a replay, and answering that only from rows that are still
// live would make a replay indistinguishable from a typo.
func (r *RefreshTokenRepository) FindByHash(
	ctx context.Context, hash string,
) (*models.RefreshToken, error) {
	var token models.RefreshToken
	err := r.db.WithContext(ctx).Where("token_hash = ?", hash).First(&token).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return nil, ErrRefreshTokenNotFound
	case err != nil:
		return nil, fmt.Errorf("find refresh token: %w", err)
	}
	return &token, nil
}

// Rotate ends one session and starts its successor in a single transaction.
//
// One transaction because the two halves are one act: a crash between them
// would either leave a session that cannot be renewed or two live tokens for
// what the user experiences as one session.
func (r *RefreshTokenRepository) Rotate(
	ctx context.Context, oldID uuid.UUID, next *models.RefreshToken, now time.Time,
) error {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(next).Error; err != nil {
			return fmt.Errorf("create refresh token: %w", err)
		}
		result := tx.Model(&models.RefreshToken{}).
			Where("id = ? AND revoked_at IS NULL", oldID).
			Updates(map[string]any{"revoked_at": now, "replaced_by": next.ID})
		if result.Error != nil {
			return fmt.Errorf("revoke refresh token: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			// Somebody else rotated it between the read and this write. The
			// safe answer is to fail: two live successors for one session is
			// exactly what rotation exists to prevent.
			return ErrRefreshTokenNotFound
		}
		return nil
	})
	if err != nil {
		return err
	}
	return nil
}

// Revoke ends one session.
func (r *RefreshTokenRepository) Revoke(ctx context.Context, id uuid.UUID, now time.Time) error {
	err := r.db.WithContext(ctx).Model(&models.RefreshToken{}).
		Where("id = ? AND revoked_at IS NULL", id).
		Update("revoked_at", now).Error
	if err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
}

// RevokeAllForUser ends every session this account has open.
//
// Used where a session is no longer trustworthy for reasons that have nothing
// to do with one token: a password reset, an administrator blocking the
// account.
func (r *RefreshTokenRepository) RevokeAllForUser(
	ctx context.Context, userID uuid.UUID, now time.Time,
) (int64, error) {
	result := r.db.WithContext(ctx).Model(&models.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", now)
	if result.Error != nil {
		return 0, fmt.Errorf("revoke user sessions: %w", result.Error)
	}
	return result.RowsAffected, nil
}

// DeleteExpired sweeps what can no longer be used, so the table stays
// proportional to the sessions that are actually open.
func (r *RefreshTokenRepository) DeleteExpired(ctx context.Context, before time.Time) (int64, error) {
	result := r.db.WithContext(ctx).
		Where("expires_at < ?", before).Delete(&models.RefreshToken{})
	if result.Error != nil {
		return 0, fmt.Errorf("sweep refresh tokens: %w", result.Error)
	}
	return result.RowsAffected, nil
}
