package repository

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// FavoriteRepository stores which listings a user has saved.
//
// The table and its unique (user_id, apartment_id) constraint have existed
// since 0001; until now nothing read or wrote them, because saved apartments
// lived in the browser's localStorage. Moving them here is what makes a
// wishlist survive a new device.
type FavoriteRepository struct {
	db *gorm.DB
}

func NewFavoriteRepository(db *gorm.DB) *FavoriteRepository {
	return &FavoriteRepository{db: db}
}

// Add saves a listing and reports whether it was newly saved.
//
// ON CONFLICT DO NOTHING rather than a check-then-insert: saving is idempotent,
// and two taps arriving together must not turn into a unique-violation error
// shown to someone who simply pressed the heart twice.
func (r *FavoriteRepository) Add(ctx context.Context, userID, apartmentID uuid.UUID) (bool, error) {
	favorite := models.Favorite{UserID: userID, ApartmentID: apartmentID}

	result := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&favorite)

	if result.Error != nil {
		if isForeignKeyViolation(result.Error) {
			return false, ErrApartmentNotFound
		}
		return false, fmt.Errorf("add favorite: %w", result.Error)
	}
	return result.RowsAffected > 0, nil
}

// Remove unsaves a listing. Removing something that was never saved is not an
// error — the caller asked for it to be gone, and it is.
func (r *FavoriteRepository) Remove(ctx context.Context, userID, apartmentID uuid.UUID) error {
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND apartment_id = ?", userID, apartmentID).
		Delete(&models.Favorite{}).Error
	if err != nil {
		return fmt.Errorf("remove favorite: %w", err)
	}
	return nil
}

// Count is how many listings this user has saved — the dashboard's figure.
//
// Only listings that still exist and are still published: a saved listing that
// has since been withdrawn is not something the user can open, so counting it
// would promise a card that cannot be rendered.
func (r *FavoriteRepository) Count(ctx context.Context, userID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Table("favorites AS f").
		Joins("JOIN apartments AS a ON a.id = f.apartment_id").
		Where("f.user_id = ? AND a.status = ?", userID, models.ApartmentStatusActive).
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("count favorites: %w", err)
	}
	return count, nil
}

// ListApartments returns the saved listings themselves, most recently saved
// first, with everything a card needs already loaded.
//
// `limit` of 0 means no limit — the saved-apartments page wants all of them,
// the dashboard wants the latest three.
func (r *FavoriteRepository) ListApartments(
	ctx context.Context, userID uuid.UUID, limit int,
) ([]models.Apartment, error) {
	// The ids first, in save order. Selecting the listings and their galleries
	// in one joined query would multiply each listing by its number of
	// pictures, and LIMIT would then cut through the middle of a gallery.
	idQuery := r.db.WithContext(ctx).
		Table("favorites AS f").
		Joins("JOIN apartments AS a ON a.id = f.apartment_id").
		Where("f.user_id = ? AND a.status = ?", userID, models.ApartmentStatusActive).
		Order("f.created_at DESC")

	if limit > 0 {
		idQuery = idQuery.Limit(limit)
	}

	var ids []uuid.UUID
	if err := idQuery.Pluck("f.apartment_id", &ids).Error; err != nil {
		return nil, fmt.Errorf("list favorite ids: %w", err)
	}
	if len(ids) == 0 {
		return []models.Apartment{}, nil
	}

	var apartments []models.Apartment
	if err := r.db.WithContext(ctx).
		Scopes(func(db *gorm.DB) *gorm.DB { return NewApartmentRepository(r.db).withRelations(db) }).
		Where("id IN ?", ids).
		Find(&apartments).Error; err != nil {
		return nil, fmt.Errorf("load favorite apartments: %w", err)
	}

	// `IN` returns rows in whatever order the planner chose, so save order is
	// restored here — the dashboard's "latest three saved" depends on it.
	byID := make(map[uuid.UUID]models.Apartment, len(apartments))
	for _, apartment := range apartments {
		byID[apartment.ID] = apartment
	}
	ordered := make([]models.Apartment, 0, len(ids))
	for _, id := range ids {
		if apartment, ok := byID[id]; ok {
			ordered = append(ordered, apartment)
		}
	}
	return ordered, nil
}

// SavedIDs is the set of listings this user has saved, for the heart on every
// card. One query for a whole page rather than one per card.
func (r *FavoriteRepository) SavedIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := r.db.WithContext(ctx).
		Model(&models.Favorite{}).
		Where("user_id = ?", userID).
		Pluck("apartment_id", &ids).Error
	if err != nil {
		return nil, fmt.Errorf("list favorite ids: %w", err)
	}
	return ids, nil
}
