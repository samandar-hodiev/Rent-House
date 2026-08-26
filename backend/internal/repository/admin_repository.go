package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
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

// AdminUserRow is a marketplace account as the administrator's table shows it:
// the account plus the one number that table needs, counted by the database.
type AdminUserRow struct {
	models.User
	Listings int64 `gorm:"column:listings"`
}

// UserQuery is what the administrator's list is filtered and paged by.
type UserQuery struct {
	Search string
	Status string
	Page   int
	Limit  int
}

// Users returns one page of marketplace accounts, and how many match in total.
//
// Filtering, searching, counting and paging all happen in PostgreSQL. Fetching
// every user and narrowing them in Go would work today and stop working at the
// first thousand accounts; more to the point, the total a paginator needs is a
// count of what matched, which the client cannot know from one page.
func (r *AdminRepository) Users(ctx context.Context, query UserQuery) ([]AdminUserRow, int64, error) {
	base := r.db.WithContext(ctx).Model(&models.User{})

	if query.Status != "" {
		base = base.Where("users.status = ?", query.Status)
	}
	if search := strings.TrimSpace(query.Search); search != "" {
		// ILIKE rather than LIKE: an administrator looking for "Alisher" should
		// not have to know how the name was capitalised. The phone is matched
		// with its punctuation removed, so "90 123" finds "+998901234567".
		pattern := "%" + strings.ToLower(search) + "%"
		// Only a term made of digits and phone punctuation is treated as a
		// phone number. "Test9" is a name that happens to contain a 9, and
		// reducing it to "9" would match every phone with a 9 in it.
		digits := ""
		if looksLikePhone(search) {
			digits = onlyDigits(search)
		}
		if digits != "" {
			base = base.Where(
				"first_name ILIKE ? OR last_name ILIKE ? OR email ILIKE ? OR phone ILIKE ?",
				pattern, pattern, pattern, "%"+digits+"%",
			)
		} else {
			base = base.Where(
				"first_name ILIKE ? OR last_name ILIKE ? OR email ILIKE ?",
				pattern, pattern, pattern,
			)
		}
	}

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	limit := query.Limit
	if limit <= 0 {
		limit = 10
	}
	page := query.Page
	if page <= 0 {
		page = 1
	}

	var rows []AdminUserRow
	err := base.
		// Deleted listings are not listings any more, so they are not counted.
		Select("users.*, (SELECT count(*) FROM apartments a WHERE a.owner_id = users.id AND a.status <> 'deleted') AS listings").
		Order("users.created_at DESC").
		Limit(limit).
		Offset((page - 1) * limit).
		Find(&rows).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list users: %w", err)
	}
	return rows, total, nil
}

// SetUserStatus blocks or unblocks a marketplace account.
func (r *AdminRepository) SetUserStatus(ctx context.Context, id uuid.UUID, status string) error {
	result := r.db.WithContext(ctx).Model(&models.User{}).
		Where("id = ?", id).
		Updates(map[string]any{"status": status, "updated_at": time.Now()})
	if result.Error != nil {
		return fmt.Errorf("set user status: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrUserNotFound
	}
	return nil
}

// UpdateProfile writes what an administrator may change about themselves.
//
// Named columns, and only the two: an administrator cannot edit their own role
// or status here, whatever a request body says.
func (r *AdminRepository) UpdateProfile(
	ctx context.Context, id uuid.UUID, name string, avatarURL *string,
) error {
	fields := map[string]any{"name": name, "updated_at": time.Now()}
	if avatarURL != nil {
		fields["avatar_url"] = *avatarURL
	}
	result := r.db.WithContext(ctx).Model(&models.Admin{}).Where("id = ?", id).Updates(fields)
	if result.Error != nil {
		return fmt.Errorf("update admin profile: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAdminNotFound
	}
	return nil
}

// looksLikePhone reports whether a term is a phone number rather than a name:
// digits and the punctuation numbers are written with, and nothing else.
func looksLikePhone(value string) bool {
	hasDigit := false
	for _, r := range value {
		switch {
		case r >= '0' && r <= '9':
			hasDigit = true
		case r == '+' || r == ' ' || r == '-' || r == '(' || r == ')':
		default:
			return false
		}
	}
	return hasDigit
}

// onlyDigits keeps the digits of a search term, so a phone typed with spaces,
// brackets or a leading + still matches what is stored.
func onlyDigits(value string) string {
	var out strings.Builder
	for _, r := range value {
		if r >= '0' && r <= '9' {
			out.WriteRune(r)
		}
	}
	return out.String()
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
