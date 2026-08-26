package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// ErrAdminNotFound is returned instead of gorm.ErrRecordNotFound so callers do
// not have to import GORM to handle a missing row.
var ErrAdminNotFound = errors.New("admin not found")

// ErrAdminEmailTaken is returned when the unique index on `email` rejects an
// insert.
var ErrAdminEmailTaken = errors.New("admin email already registered")

// ErrOwnerExists is returned when the partial unique index refuses a second
// owner. The service checks first as well; this is what catches two requests
// racing each other.
var ErrOwnerExists = errors.New("an owner already exists")

// AdminRepository reads and writes dashboard accounts and the sidebar
// configuration. It holds no rules about who may do what — that is the
// service's job.
type AdminRepository struct {
	db *gorm.DB
}

func NewAdminRepository(db *gorm.DB) *AdminRepository {
	return &AdminRepository{db: db}
}

// Create inserts an administrator.
//
// The two unique indexes decide the outcome rather than a check-then-insert:
// a check has a window in which two requests both pass it, and the second
// owner would be created.
func (r *AdminRepository) Create(ctx context.Context, admin *models.Admin) error {
	if err := r.db.WithContext(ctx).Create(admin).Error; err != nil {
		if isUniqueViolation(err) {
			// Which index was breached decides what the caller can say.
			if isConstraint(err, "uq_admins_single_owner") {
				return ErrOwnerExists
			}
			return ErrAdminEmailTaken
		}
		return fmt.Errorf("create admin: %w", err)
	}
	return nil
}

// FindByEmail looks an account up for sign-in. The address is expected already
// lowercased by the caller, which is how it was stored.
func (r *AdminRepository) FindByEmail(ctx context.Context, email string) (*models.Admin, error) {
	var admin models.Admin
	err := r.db.WithContext(ctx).Where("email = ?", email).First(&admin).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAdminNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find admin by email: %w", err)
	}
	return &admin, nil
}

// FindByID loads the account a token names. Called on every authenticated admin
// request, so that an account suspended a moment ago stops working now rather
// than when its token happens to expire.
func (r *AdminRepository) FindByID(ctx context.Context, id uuid.UUID) (*models.Admin, error) {
	var admin models.Admin
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&admin).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAdminNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find admin: %w", err)
	}
	return &admin, nil
}

// List returns every administrator, the owner first and then newest first.
func (r *AdminRepository) List(ctx context.Context) ([]models.Admin, error) {
	var admins []models.Admin
	err := r.db.WithContext(ctx).
		Order("CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at DESC").
		Find(&admins).Error
	if err != nil {
		return nil, fmt.Errorf("list admins: %w", err)
	}
	return admins, nil
}

// UpdateStatus switches an account on or off.
func (r *AdminRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	result := r.db.WithContext(ctx).Model(&models.Admin{}).
		Where("id = ?", id).
		Updates(map[string]any{"status": status, "updated_at": time.Now()})
	if result.Error != nil {
		return fmt.Errorf("update admin status: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAdminNotFound
	}
	return nil
}

// Delete removes an account.
//
// The `role <> 'owner'` in the WHERE clause is not the only guard — the service
// refuses first — but it means no code path, present or future, can delete the
// owner through this repository.
func (r *AdminRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).
		Where("id = ? AND role <> ?", id, models.AdminRoleOwner).
		Delete(&models.Admin{})
	if result.Error != nil {
		return fmt.Errorf("delete admin: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAdminNotFound
	}
	return nil
}

// TouchLastLogin records a successful sign-in.
func (r *AdminRepository) TouchLastLogin(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	err := r.db.WithContext(ctx).Model(&models.Admin{}).
		Where("id = ?", id).
		Updates(map[string]any{"last_login_at": now, "updated_at": now}).Error
	if err != nil {
		return fmt.Errorf("touch admin last login: %w", err)
	}
	return nil
}

// CountOwners reports how many owner accounts exist. Used to answer "is the
// system bootstrapped" without loading the row.
func (r *AdminRepository) CountOwners(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&models.Admin{}).
		Where("role = ?", models.AdminRoleOwner).Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("count owners: %w", err)
	}
	return count, nil
}

// Sections returns the sidebar configuration, section to enabled.
func (r *AdminRepository) Sections(ctx context.Context) (map[string]bool, error) {
	var rows []models.AdminSidebarSection
	if err := r.db.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("read sidebar sections: %w", err)
	}
	sections := make(map[string]bool, len(rows))
	for _, row := range rows {
		sections[row.Section] = row.Enabled
	}
	return sections, nil
}

// SectionEnabled reports whether one section is switched on.
//
// A section with no row is treated as off. The alternative — defaulting to on —
// would mean a typo in a route's section name silently granted access.
func (r *AdminRepository) SectionEnabled(ctx context.Context, section string) (bool, error) {
	var row models.AdminSidebarSection
	err := r.db.WithContext(ctx).Where("section = ?", section).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read sidebar section: %w", err)
	}
	return row.Enabled, nil
}

// SetSections writes the configuration. Upserted in one statement so a partial
// failure cannot leave half the switches from one request and half from
// another.
func (r *AdminRepository) SetSections(ctx context.Context, sections map[string]bool) error {
	if len(sections) == 0 {
		return nil
	}

	rows := make([]models.AdminSidebarSection, 0, len(sections))
	now := time.Now()
	for section, enabled := range sections {
		rows = append(rows, models.AdminSidebarSection{
			Section: section, Enabled: enabled, UpdatedAt: now,
		})
	}

	err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "section"}},
		DoUpdates: clause.AssignmentColumns([]string{"enabled", "updated_at"}),
	}).Create(&rows).Error
	if err != nil {
		return fmt.Errorf("write sidebar sections: %w", err)
	}
	return nil
}
