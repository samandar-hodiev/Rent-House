package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
)

// What a caller can act on. Everything else is an internal error.
var (
	// ErrAdminCredentials covers both a missing account and a wrong password.
	// One error for both is the point: telling them apart turns the sign-in
	// form into a way to ask which addresses are registered.
	ErrAdminCredentials = errors.New("invalid admin credentials")

	ErrAdminInactive  = errors.New("admin account is inactive")
	ErrAdminSuspended = errors.New("admin account is suspended")

	ErrAdminNotFound      = errors.New("admin not found")
	ErrAdminEmailTaken    = errors.New("admin email already registered")
	ErrAdminForbidden     = errors.New("not permitted")
	ErrOwnerImmutable     = errors.New("the owner account cannot be changed this way")
	ErrOwnerAlreadyExists = errors.New("an owner already exists")
	ErrInvalidAdminRole   = errors.New("invalid admin role")
	ErrInvalidAdminStatus = errors.New("invalid admin status")
	// ErrBlockReasonRequired is returned when an account is blocked without
	// saying why.
	ErrBlockReasonRequired = errors.New("a block reason is required")
)

// adminSessionTTL is how long a dashboard session lasts. Shorter than the
// marketplace's, because an administrator's token opens more.
const adminSessionTTL = 8 * time.Hour

// adminBcryptCost matches the marketplace's, and is well above the library
// default.
const adminBcryptCost = 12

// AdminService holds every rule about who may administer what.
//
// Authentication and authorization are separate here on purpose: Login answers
// "who is this", and the Ensure* helpers answer "may they do this". The HTTP
// layer never decides either.
type AdminService struct {
	admins *repository.AdminRepository
	tokens *token.Service
}

func NewAdminService(admins *repository.AdminRepository, tokens *token.Service) *AdminService {
	return &AdminService{admins: admins, tokens: tokens}
}

// Session is what a successful sign-in produces.
type Session struct {
	Admin     *models.Admin
	Token     string
	ExpiresAt time.Time
}

// Login verifies an email and password and starts a session.
//
// The password is compared even when no account was found, against a fixed
// hash. Skipping the comparison would make a missing account measurably faster
// to reject than a wrong password, and that timing difference is the same
// account enumeration the shared error message exists to prevent.
func (s *AdminService) Login(ctx context.Context, email, password string) (*Session, error) {
	admin, err := s.admins.FindByEmail(ctx, normalizeAdminEmail(email))
	if err != nil {
		if errors.Is(err, repository.ErrAdminNotFound) {
			compareAgainstDummy(password)
			return nil, ErrAdminCredentials
		}
		return nil, fmt.Errorf("admin login: %w", err)
	}

	if bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(password)) != nil {
		return nil, ErrAdminCredentials
	}

	// Status is checked only after the password matches. Reporting "suspended"
	// to someone who guessed the address but not the password would confirm the
	// address exists.
	switch admin.Status {
	case models.AdminStatusActive:
	case models.AdminStatusSuspended:
		return nil, ErrAdminSuspended
	default:
		return nil, ErrAdminInactive
	}

	signed, expiresAt, err := s.tokens.GenerateScoped(admin.ID, token.ScopeAdmin, adminSessionTTL)
	if err != nil {
		return nil, fmt.Errorf("admin login: %w", err)
	}

	// Best effort: a session is not worth refusing because a bookkeeping column
	// could not be written.
	if err := s.admins.TouchLastLogin(ctx, admin.ID); err == nil {
		now := time.Now()
		admin.LastLoginAt = &now
	}

	return &Session{Admin: admin, Token: signed, ExpiresAt: expiresAt}, nil
}

// Authenticate loads the account a verified token names, and refuses one whose
// account has since been switched off.
//
// Called on every admin request rather than trusting the token alone: a token
// stays valid until it expires, and an owner who suspends an account expects
// that to take effect now.
func (s *AdminService) Authenticate(ctx context.Context, id uuid.UUID) (*models.Admin, error) {
	admin, err := s.admins.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrAdminNotFound) {
			return nil, ErrAdminNotFound
		}
		return nil, fmt.Errorf("authenticate admin: %w", err)
	}
	if !admin.CanSignIn() {
		if admin.Status == models.AdminStatusSuspended {
			return nil, ErrAdminSuspended
		}
		return nil, ErrAdminInactive
	}
	return admin, nil
}

// List returns every administrator.
func (s *AdminService) List(ctx context.Context) ([]models.Admin, error) {
	return s.admins.List(ctx)
}

// CreateInput is what the owner fills in to add an administrator.
type CreateInput struct {
	Name     string
	Email    string
	Role     string
	Password string
}

// Create adds an administrator.
//
// Only the owner may call it, and only to create a super admin: a second owner
// is refused here and again by a unique index, and there is no role above super
// admin for an administrator to grant. Between them those two rules are the
// whole of "nobody can promote themselves".
func (s *AdminService) Create(
	ctx context.Context, actor *models.Admin, input CreateInput,
) (*models.Admin, error) {
	if !actor.IsOwner() {
		return nil, ErrAdminForbidden
	}
	if input.Role != models.AdminRoleSuperAdmin {
		// Includes "owner": the owner cannot create a peer, and an unrecognised
		// role is not silently downgraded into a valid one.
		if input.Role == models.AdminRoleOwner {
			return nil, ErrOwnerAlreadyExists
		}
		return nil, ErrInvalidAdminRole
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), adminBcryptCost)
	if err != nil {
		return nil, fmt.Errorf("hash admin password: %w", err)
	}

	admin := &models.Admin{
		Name:         strings.TrimSpace(input.Name),
		Email:        normalizeAdminEmail(input.Email),
		PasswordHash: string(hash),
		Role:         models.AdminRoleSuperAdmin,
		Status:       models.AdminStatusActive,
	}

	if err := s.admins.Create(ctx, admin); err != nil {
		switch {
		case errors.Is(err, repository.ErrAdminEmailTaken):
			return nil, ErrAdminEmailTaken
		case errors.Is(err, repository.ErrOwnerExists):
			return nil, ErrOwnerAlreadyExists
		default:
			return nil, fmt.Errorf("create admin: %w", err)
		}
	}
	return admin, nil
}

// SetStatus switches an account on or off.
//
// The owner's own status is not changeable — by anyone, including the owner.
// An owner who suspended themselves would lock the only account that can undo
// it out of the system.
func (s *AdminService) SetStatus(
	ctx context.Context, actor *models.Admin, id uuid.UUID, status string,
) error {
	if !actor.IsOwner() {
		return ErrAdminForbidden
	}
	if !isValidAdminStatus(status) {
		return ErrInvalidAdminStatus
	}

	target, err := s.admins.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrAdminNotFound) {
			return ErrAdminNotFound
		}
		return fmt.Errorf("set admin status: %w", err)
	}
	if target.IsOwner() {
		return ErrOwnerImmutable
	}

	return s.admins.UpdateStatus(ctx, id, status)
}

// Delete removes an administrator.
//
// The owner cannot be deleted, and an actor cannot delete themselves — the
// first would leave the system with nobody able to administer it, the second is
// a mistake nobody means to make.
func (s *AdminService) Delete(ctx context.Context, actor *models.Admin, id uuid.UUID) error {
	if !actor.IsOwner() {
		return ErrAdminForbidden
	}
	if actor.ID == id {
		return ErrOwnerImmutable
	}

	target, err := s.admins.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrAdminNotFound) {
			return ErrAdminNotFound
		}
		return fmt.Errorf("delete admin: %w", err)
	}
	if target.IsOwner() {
		return ErrOwnerImmutable
	}

	return s.admins.Delete(ctx, id)
}

// Sections returns the sidebar configuration.
func (s *AdminService) Sections(ctx context.Context) (map[string]bool, error) {
	return s.admins.Sections(ctx)
}

// SetSections writes the sidebar configuration. The owner's, and nobody else's.
func (s *AdminService) SetSections(
	ctx context.Context, actor *models.Admin, sections map[string]bool,
) error {
	if !actor.IsOwner() {
		return ErrAdminForbidden
	}
	return s.admins.SetSections(ctx, sections)
}

// MayUseSection reports whether an administrator is allowed into one section of
// the dashboard.
//
// The owner is never restricted: the switches describe what a super admin is
// offered, and an owner locked out of the page holding the switches could not
// switch anything back on.
func (s *AdminService) MayUseSection(
	ctx context.Context, actor *models.Admin, section string,
) (bool, error) {
	if actor.IsOwner() {
		return true, nil
	}
	return s.admins.SectionEnabled(ctx, section)
}

// UserPage is one page of marketplace accounts, with what a paginator needs.
type UserPage struct {
	Users []repository.AdminUserRow
	Total int64
	Page  int
	Limit int
}

// maxUserPageSize caps what a caller may ask for, so a request for a million
// rows cannot be made by editing a query string.
const maxUserPageSize = 100

// Users lists marketplace accounts for the administrator's table.
func (s *AdminService) Users(
	ctx context.Context, search, status string, page, limit int,
) (*UserPage, error) {
	if status != "" && status != models.UserStatusActive && status != models.UserStatusBlocked {
		return nil, ErrInvalidAdminStatus
	}
	if page < 1 {
		page = 1
	}
	switch {
	case limit < 1:
		limit = 10
	case limit > maxUserPageSize:
		limit = maxUserPageSize
	}

	rows, total, err := s.admins.Users(ctx, repository.UserQuery{
		Search: search, Status: status, Page: page, Limit: limit,
	})
	if err != nil {
		return nil, err
	}
	return &UserPage{Users: rows, Total: total, Page: page, Limit: limit}, nil
}

// Blocking has to be explained. The minimum is short enough not to be a
// hurdle and long enough that "x" is not an explanation.
const minBlockReasonLength = 3

// SetUserStatus blocks or unblocks a marketplace account.
//
// Any administrator may do it — moderating the marketplace is what the role is
// for — but only an administrator: the middleware has already established that
// the caller is one.
//
// Blocking requires a reason, checked here rather than only in the browser: the
// endpoint is reachable without the form, and a block with no reason on record
// is exactly what this feature exists to prevent.
func (s *AdminService) SetUserStatus(
	ctx context.Context, actor *models.Admin, id uuid.UUID, status, reason string,
) error {
	switch status {
	case models.UserStatusBlocked:
		trimmed := strings.TrimSpace(reason)
		if len(trimmed) < minBlockReasonLength {
			return ErrBlockReasonRequired
		}
		if err := s.admins.BlockUser(ctx, id, actor.ID, trimmed); err != nil {
			if errors.Is(err, repository.ErrUserNotFound) {
				return ErrAdminNotFound
			}
			return err
		}
		return nil

	case models.UserStatusActive:
		if err := s.admins.UnblockUser(ctx, id, actor.ID); err != nil {
			if errors.Is(err, repository.ErrUserNotFound) {
				return ErrAdminNotFound
			}
			return err
		}
		return nil

	default:
		return ErrInvalidAdminStatus
	}
}

// Audit records one administrator action.
//
// Errors are swallowed: an action that succeeded must not be reported as having
// failed because a log row could not be written. What is lost is one line of
// history, which is worth less than a false failure.
func (s *AdminService) Audit(
	ctx context.Context, actor *models.Admin, action, target, ip, status string,
) {
	entry := &models.AdminAuditLog{
		Action: action, Target: target, IP: ip, Status: status,
	}
	if actor != nil {
		entry.AdminID = &actor.ID
		entry.AdminName = actor.Name
	}
	if entry.AdminName == "" {
		entry.AdminName = target
	}
	_ = s.admins.RecordAudit(ctx, entry)
}

// AuditPage is one page of the action log.
type AuditPage struct {
	Entries []models.AdminAuditLog
	Total   int64
	Page    int
	Limit   int
}

// AuditLogs returns the action log, newest first.
func (s *AdminService) AuditLogs(ctx context.Context, page, limit int) (*AuditPage, error) {
	if page < 1 {
		page = 1
	}
	switch {
	case limit < 1:
		limit = 20
	case limit > maxUserPageSize:
		limit = maxUserPageSize
	}
	rows, total, err := s.admins.AuditLogs(ctx, page, limit)
	if err != nil {
		return nil, err
	}
	return &AuditPage{Entries: rows, Total: total, Page: page, Limit: limit}, nil
}

// UserDetail is one account with its figures and its block history.
type UserDetail struct {
	User    *repository.AdminUserDetail
	History []repository.UserBlockRecord
}

// User loads one marketplace account for its detail page.
func (s *AdminService) User(ctx context.Context, id uuid.UUID) (*UserDetail, error) {
	user, err := s.admins.UserDetail(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, ErrAdminNotFound
		}
		return nil, err
	}
	history, err := s.admins.UserBlockHistory(ctx, id)
	if err != nil {
		return nil, err
	}
	return &UserDetail{User: user, History: history}, nil
}

// Sidebar sections that only ever belong to the owner, whatever the
// configuration says. Reported by Permissions so the roles page describes the
// rules the server actually enforces rather than a table somebody wrote once.
var ownerOnlySections = []string{"sidebarControl", "adminManagement"}

// RolePermission is one line of the roles table.
type RolePermission struct {
	Section    string `json:"section"`
	Owner      bool   `json:"owner"`
	SuperAdmin bool   `json:"super_admin"`
}

// Permissions describes what each role may reach.
//
// Derived rather than declared: the owner is never restricted, a handful of
// sections are the owner's by rule, and the rest follow the configuration the
// owner set. Reading it from the same places the middleware reads means the
// page cannot claim a permission the server would refuse.
func (s *AdminService) Permissions(ctx context.Context) ([]RolePermission, error) {
	sections, err := s.admins.Sections(ctx)
	if err != nil {
		return nil, err
	}

	ownerOnly := make(map[string]bool, len(ownerOnlySections))
	for _, section := range ownerOnlySections {
		ownerOnly[section] = true
	}

	out := make([]RolePermission, 0, len(sections)+len(ownerOnlySections))
	for section, enabled := range sections {
		out = append(out, RolePermission{
			Section: section, Owner: true, SuperAdmin: enabled && !ownerOnly[section],
		})
	}
	for _, section := range ownerOnlySections {
		if _, listed := sections[section]; !listed {
			out = append(out, RolePermission{Section: section, Owner: true, SuperAdmin: false})
		}
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Section < out[j].Section })
	return out, nil
}

// UpdateProfile changes the calling administrator's own name and picture.
//
// The account edited is the one the token named — there is no id in the
// signature, so this cannot be aimed at anybody else. Role and status are not
// parameters: an administrator cannot promote themselves by editing a form.
func (s *AdminService) UpdateProfile(
	ctx context.Context, actor *models.Admin, name string, avatarURL *string,
) (*models.Admin, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return nil, ErrNameRequired
	}

	if err := s.admins.UpdateProfile(ctx, actor.ID, trimmed, avatarURL); err != nil {
		if errors.Is(err, repository.ErrAdminNotFound) {
			return nil, ErrAdminNotFound
		}
		return nil, err
	}
	return s.admins.FindByID(ctx, actor.ID)
}

// EnsureOwner creates the first owner if there is none.
//
// Idempotent, so it can run on every deploy: with an owner present it reports
// false and changes nothing. This is the only way an owner is ever created —
// there is no endpoint for it, because an endpoint that creates the account
// with the highest privilege is a door that only needs to be left open once.
func (s *AdminService) EnsureOwner(
	ctx context.Context, name, email, password string,
) (bool, error) {
	count, err := s.admins.CountOwners(ctx)
	if err != nil {
		return false, err
	}
	if count > 0 {
		return false, nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), adminBcryptCost)
	if err != nil {
		return false, fmt.Errorf("hash owner password: %w", err)
	}

	owner := &models.Admin{
		Name:         strings.TrimSpace(name),
		Email:        normalizeAdminEmail(email),
		PasswordHash: string(hash),
		Role:         models.AdminRoleOwner,
		Status:       models.AdminStatusActive,
	}
	if err := s.admins.Create(ctx, owner); err != nil {
		if errors.Is(err, repository.ErrOwnerExists) {
			// Another process won the race. That is the desired end state.
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func normalizeAdminEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func isValidAdminStatus(status string) bool {
	for _, valid := range models.AdminStatuses {
		if status == valid {
			return true
		}
	}
	return false
}

// dummyHash is a real bcrypt hash of a value nobody knows, at the same cost as
// a stored one. Comparing against it makes "no such account" take the same time
// as "wrong password".
var dummyHash = []byte("$2a$12$C6UzMDM.H6dfI/f/IKcEe.7Q2Wl0Vh0hI7Lw0gLZ9Z3iC0mS9YQhq")

func compareAgainstDummy(password string) {
	_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
}
