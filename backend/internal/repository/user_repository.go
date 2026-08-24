// Package repository holds database access. It contains no business rules: no
// hashing, no token handling, no authorization — only queries.
package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// ErrUserNotFound is returned instead of gorm.ErrRecordNotFound so callers do
// not have to import GORM to handle a missing row.
var ErrUserNotFound = errors.New("user not found")

// ErrDuplicateUser is returned when a unique constraint rejects an insert. The
// caller decides what to tell the client; it deliberately does not say which
// column collided.
var ErrDuplicateUser = errors.New("user already exists")

// uniqueViolation is PostgreSQL's SQLSTATE for a unique constraint breach.
const uniqueViolation = "23505"

// UserRepository reads and writes users.
type UserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}

// Create inserts a user.
//
// It relies on the database's unique constraints rather than checking first:
// a check-then-insert has a race window in which two requests both pass the
// check. The constraint has no such window.
func (r *UserRepository) Create(ctx context.Context, user *models.User) error {
	if err := r.db.WithContext(ctx).Create(user).Error; err != nil {
		if isUniqueViolation(err) {
			return ErrDuplicateUser
		}
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

// UpdateProfile writes the fields a person may change about themselves.
//
// Named columns rather than saving the whole struct: a full save would carry
// the password hash, the role and the verification state back to the database
// on every profile edit, and a bug anywhere upstream could then change them.
// `Updates` with a map also writes nils, which is how a phone number or an
// avatar is cleared.
func (r *UserRepository) UpdateProfile(
	ctx context.Context, id uuid.UUID, fields map[string]any,
) error {
	err := r.db.WithContext(ctx).
		Model(&models.User{}).
		Where("id = ?", id).
		Updates(fields).Error
	if err != nil {
		// Phone numbers are unique; two accounts cannot claim one.
		if isUniqueViolation(err) {
			return ErrDuplicateUser
		}
		return fmt.Errorf("update profile: %w", err)
	}
	return nil
}

// FindByID loads a user by primary key.
func (r *UserRepository) FindByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	return r.findBy(ctx, "id = ?", id)
}

// FindByEmail loads a user by email. The caller supplies an already-normalized
// address; matching is exact.
func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	return r.findBy(ctx, "email = ?", email)
}

// FindByPhone loads a user by phone number.
func (r *UserRepository) FindByPhone(ctx context.Context, phone string) (*models.User, error) {
	return r.findBy(ctx, "phone = ?", phone)
}

// ExistsByContact reports whether an account already holds this email or phone.
// Used before sending a registration code, so the caller is told immediately
// rather than after typing in a code.
func (r *UserRepository) ExistsByContact(ctx context.Context, method, contact string) (bool, error) {
	column := "phone"
	if method == models.VerificationMethodEmail {
		column = "email"
	}

	var count int64
	if err := r.db.WithContext(ctx).Model(&models.User{}).
		Where(column+" = ?", contact).Count(&count).Error; err != nil {
		return false, fmt.Errorf("check contact: %w", err)
	}
	return count > 0, nil
}

// FindByIdentifier loads a user by email or phone.
//
// Which column to search is decided by the shape of the value, so a login form
// can accept either without asking the user which one they typed.
func (r *UserRepository) FindByIdentifier(ctx context.Context, identifier string) (*models.User, error) {
	if strings.Contains(identifier, "@") {
		return r.FindByEmail(ctx, identifier)
	}
	return r.FindByPhone(ctx, identifier)
}

func (r *UserRepository) findBy(ctx context.Context, query string, arg any) (*models.User, error) {
	var user models.User
	if err := r.db.WithContext(ctx).Where(query, arg).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("find user: %w", err)
	}
	return &user, nil
}

func isUniqueViolation(err error) bool {
	// The pgx driver surfaces the SQLSTATE in the error text; matching on the
	// code rather than the constraint name keeps this independent of naming.
	return err != nil && strings.Contains(err.Error(), "SQLSTATE "+uniqueViolation)
}
