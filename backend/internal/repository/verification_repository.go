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

// ErrVerificationNotFound is returned when no live verification matches.
var ErrVerificationNotFound = errors.New("verification not found")

// VerificationRepository reads and writes verification codes.
type VerificationRepository struct {
	db *gorm.DB
}

func NewVerificationRepository(db *gorm.DB) *VerificationRepository {
	return &VerificationRepository{db: db}
}

func (r *VerificationRepository) Create(ctx context.Context, v *models.AuthVerification) error {
	if err := r.db.WithContext(ctx).Create(v).Error; err != nil {
		return fmt.Errorf("create verification: %w", err)
	}
	return nil
}

// Save persists changes to an existing row — the attempt counter, the verified
// timestamp, the issued token.
func (r *VerificationRepository) Save(ctx context.Context, v *models.AuthVerification) error {
	if err := r.db.WithContext(ctx).Save(v).Error; err != nil {
		return fmt.Errorf("save verification: %w", err)
	}
	return nil
}

// FindByID loads a verification by its identifier.
func (r *VerificationRepository) FindByID(ctx context.Context, id uuid.UUID) (*models.AuthVerification, error) {
	var v models.AuthVerification
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&v).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrVerificationNotFound
		}
		return nil, fmt.Errorf("find verification: %w", err)
	}
	return &v, nil
}

// FindByTokenHash loads the verification a registration token belongs to.
func (r *VerificationRepository) FindByTokenHash(ctx context.Context, hash string) (*models.AuthVerification, error) {
	var v models.AuthVerification
	if err := r.db.WithContext(ctx).
		Where("registration_token_hash = ?", hash).First(&v).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrVerificationNotFound
		}
		return nil, fmt.Errorf("find verification by token: %w", err)
	}
	return &v, nil
}

// FindLatestForContact returns the most recent verification for a contact,
// spent or not. The service needs the spent ones too, to enforce the cooldown.
func (r *VerificationRepository) FindLatestForContact(
	ctx context.Context, purpose, method, contact string,
) (*models.AuthVerification, error) {
	column := "phone"
	if method == models.VerificationMethodEmail {
		column = "email"
	}

	var v models.AuthVerification
	err := r.db.WithContext(ctx).
		Where("purpose = ? AND "+column+" = ?", purpose, contact).
		Order("created_at DESC").
		First(&v).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrVerificationNotFound
		}
		return nil, fmt.Errorf("find latest verification: %w", err)
	}
	return &v, nil
}

// ConsumeOpenForContact marks every live verification for a contact as spent.
//
// Called before issuing a new code, so the previous one stops working the
// moment a replacement is sent — otherwise several valid codes would be in
// flight at once, multiplying an attacker's chances.
func (r *VerificationRepository) ConsumeOpenForContact(
	ctx context.Context, purpose, method, contact string, at time.Time,
) error {
	column := "phone"
	if method == models.VerificationMethodEmail {
		column = "email"
	}

	err := r.db.WithContext(ctx).Model(&models.AuthVerification{}).
		Where("purpose = ? AND "+column+" = ? AND consumed_at IS NULL", purpose, contact).
		Updates(map[string]any{"consumed_at": at, "updated_at": at}).Error
	if err != nil {
		return fmt.Errorf("consume open verifications: %w", err)
	}
	return nil
}

// DeleteExpiredBefore removes verifications that are long dead.
//
// A cutoff well past expiry is used rather than expiry itself, so a row stays
// around briefly for support questions before it is swept.
func (r *VerificationRepository) DeleteExpiredBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	tx := r.db.WithContext(ctx).
		Where("expires_at < ?", cutoff).
		Delete(&models.AuthVerification{})
	if tx.Error != nil {
		return 0, fmt.Errorf("delete expired verifications: %w", tx.Error)
	}
	return tx.RowsAffected, nil
}
