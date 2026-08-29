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
	// The block in force, if any. Null for an active account, and null for a
	// blocked one only if the row predates this table.
	BlockReason   *string    `gorm:"column:block_reason"`
	BlockedAt     *time.Time `gorm:"column:blocked_at"`
	BlockedByName *string    `gorm:"column:blocked_by_name"`
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
		// Every column is qualified. The list joins `admins` to fetch who
		// blocked whom, and that table has an `email` of its own — an
		// unqualified one is ambiguous and PostgreSQL rejects the whole query.
		if digits != "" {
			base = base.Where(
				"users.first_name ILIKE ? OR users.last_name ILIKE ? OR users.email ILIKE ? OR users.phone ILIKE ?",
				pattern, pattern, pattern, "%"+digits+"%",
			)
		} else {
			base = base.Where(
				"users.first_name ILIKE ? OR users.last_name ILIKE ? OR users.email ILIKE ?",
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
		// One join to the block that is still in force — the partial unique
		// index guarantees there is at most one — so a blocked account arrives
		// with the reason it was blocked for rather than needing a second
		// request per row.
		Joins("LEFT JOIN admin_user_blocks b ON b.user_id = users.id AND b.unblocked_at IS NULL").
		Joins("LEFT JOIN admins ab ON ab.id = b.blocked_by").
		// Deleted listings are not listings any more, so they are not counted.
		Select(`users.*,
			(SELECT count(*) FROM apartments a WHERE a.owner_id = users.id AND a.status <> 'deleted') AS listings,
			b.reason AS block_reason,
			b.blocked_at AS blocked_at,
			ab.name AS blocked_by_name`).
		Order("users.created_at DESC").
		Limit(limit).
		Offset((page - 1) * limit).
		Find(&rows).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list users: %w", err)
	}
	return rows, total, nil
}

// BlockUser marks an account blocked and records why.
//
// Both writes happen in one transaction. Separately, a failure between them
// would leave an account blocked with no reason on record, or a reason with no
// block — and the reason is the whole point of asking for one.
func (r *AdminRepository) BlockUser(
	ctx context.Context, userID, adminID uuid.UUID, reason string,
) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&models.User{}).
			Where("id = ?", userID).
			Updates(map[string]any{"status": models.UserStatusBlocked, "updated_at": time.Now()})
		if result.Error != nil {
			return fmt.Errorf("block user: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return ErrUserNotFound
		}

		block := &models.AdminUserBlock{
			UserID: userID, BlockedBy: &adminID, Reason: reason,
		}
		if err := tx.Create(block).Error; err != nil {
			// The partial unique index refuses a second open block. Blocking an
			// already-blocked account is not an error worth failing on — the
			// account is blocked, which is what the caller wanted.
			if isUniqueViolation(err) {
				return nil
			}
			return fmt.Errorf("record block: %w", err)
		}
		return nil
	})
}

// UnblockUser lifts a block and closes its record.
//
// The row is stamped, never deleted: what somebody was blocked for stays
// answerable after the block is lifted.
func (r *AdminRepository) UnblockUser(ctx context.Context, userID, adminID uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		result := tx.Model(&models.User{}).
			Where("id = ?", userID).
			Updates(map[string]any{"status": models.UserStatusActive, "updated_at": now})
		if result.Error != nil {
			return fmt.Errorf("unblock user: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return ErrUserNotFound
		}

		err := tx.Model(&models.AdminUserBlock{}).
			Where("user_id = ? AND unblocked_at IS NULL", userID).
			Updates(map[string]any{"unblocked_at": now, "unblocked_by": adminID}).Error
		if err != nil {
			return fmt.Errorf("close block record: %w", err)
		}
		return nil
	})
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

// AdminUserDetail is one marketplace account with the figures its page shows.
type AdminUserDetail struct {
	models.User
	TotalListings  int64 `gorm:"column:total_listings"`
	ActiveListings int64 `gorm:"column:active_listings"`
	ClosedListings int64 `gorm:"column:closed_listings"`
	DraftListings  int64 `gorm:"column:draft_listings"`
	Chats          int64 `gorm:"column:chats"`
	Saves          int64 `gorm:"column:saves"`
}

// UserDetail loads one account and counts what it has done.
//
// Every figure is a subquery rather than rows fetched and tallied in Go, so the
// page costs one round trip whatever the account has been up to.
func (r *AdminRepository) UserDetail(
	ctx context.Context, id uuid.UUID,
) (*AdminUserDetail, error) {
	var row AdminUserDetail
	err := r.db.WithContext(ctx).
		Table("users").
		Where("id = ?", id).
		Select(`users.*,
			(SELECT count(*) FROM apartments a WHERE a.owner_id = users.id AND a.status <> 'deleted')
			                                                                  AS total_listings,
			(SELECT count(*) FROM apartments a WHERE a.owner_id = users.id AND a.status = 'active')
			                                                                  AS active_listings,
			(SELECT count(*) FROM apartments a WHERE a.owner_id = users.id AND a.status = 'closed')
			                                                                  AS closed_listings,
			(SELECT count(*) FROM apartments a WHERE a.owner_id = users.id AND a.status = 'draft')
			                                                                  AS draft_listings,
			(SELECT count(*) FROM conversations c
			  WHERE c.buyer_id = users.id OR c.owner_id = users.id)           AS chats,
			(SELECT count(*) FROM favorites f WHERE f.user_id = users.id)     AS saves`).
		Scan(&row).Error
	if err != nil {
		return nil, fmt.Errorf("user detail: %w", err)
	}
	if row.ID == uuid.Nil {
		return nil, ErrUserNotFound
	}
	return &row, nil
}

// UserBlockRecord is one entry of an account's block history.
type UserBlockRecord struct {
	Reason          string     `gorm:"column:reason"`
	BlockedAt       time.Time  `gorm:"column:blocked_at"`
	BlockedByName   *string    `gorm:"column:blocked_by_name"`
	UnblockedAt     *time.Time `gorm:"column:unblocked_at"`
	UnblockedByName *string    `gorm:"column:unblocked_by_name"`
}

// UserBlockHistory returns every time an account was blocked, newest first.
//
// The real record behind the status badge: an account blocked and released
// twice has two rows here, and neither is erased by the release.
func (r *AdminRepository) UserBlockHistory(
	ctx context.Context, id uuid.UUID,
) ([]UserBlockRecord, error) {
	var rows []UserBlockRecord
	err := r.db.WithContext(ctx).Raw(`
		SELECT b.reason, b.blocked_at, b.unblocked_at,
		       btrim(ba.name) AS blocked_by_name,
		       btrim(ua.name) AS unblocked_by_name
		FROM admin_user_blocks b
		LEFT JOIN admins ba ON ba.id = b.blocked_by
		LEFT JOIN admins ua ON ua.id = b.unblocked_by
		WHERE b.user_id = ?
		ORDER BY b.blocked_at DESC
	`, id).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("user block history: %w", err)
	}
	return rows, nil
}

// RecordAudit writes one entry of the admin action log.
//
// Best effort by design: the caller ignores the error. An action that succeeded
// must not be reported as failed because the bookkeeping row could not be
// written, and a failed write here is a logging problem, not a refusal.
func (r *AdminRepository) RecordAudit(ctx context.Context, entry *models.AdminAuditLog) error {
	if err := r.db.WithContext(ctx).Create(entry).Error; err != nil {
		return fmt.Errorf("record audit: %w", err)
	}
	return nil
}

// AuditLogs returns the action log, newest first.
func (r *AdminRepository) AuditLogs(
	ctx context.Context, page, limit int,
) ([]models.AdminAuditLog, int64, error) {
	base := r.db.WithContext(ctx).Model(&models.AdminAuditLog{})

	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count audit logs: %w", err)
	}

	if limit <= 0 {
		limit = 20
	}
	if page <= 0 {
		page = 1
	}

	var rows []models.AdminAuditLog
	err := base.Order("created_at DESC").
		Limit(limit).Offset((page - 1) * limit).
		Find(&rows).Error
	if err != nil {
		return nil, 0, fmt.Errorf("list audit logs: %w", err)
	}
	return rows, total, nil
}
