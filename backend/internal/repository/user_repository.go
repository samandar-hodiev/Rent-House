// Package repository holds database access. It contains no business rules: no
// hashing, no token handling, no authorization — only queries.
package repository

import (
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
func (r *UserRepository) Create(user *models.User) error {
	if err := r.db.Create(user).Error; err != nil {
		if isUniqueViolation(err) {
			return ErrDuplicateUser
		}
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

// FindByID loads a user by primary key.
func (r *UserRepository) FindByID(id uuid.UUID) (*models.User, error) {
	return r.findBy("id = ?", id)
}

// FindByEmail loads a user by email. The caller supplies an already-normalized
// address; matching is exact.
func (r *UserRepository) FindByEmail(email string) (*models.User, error) {
	return r.findBy("email = ?", email)
}

// FindByPhone loads a user by phone number.
func (r *UserRepository) FindByPhone(phone string) (*models.User, error) {
	return r.findBy("phone = ?", phone)
}

// FindByIdentifier loads a user by email or phone.
//
// Which column to search is decided by the shape of the value, so a login form
// can accept either without asking the user which one they typed.
func (r *UserRepository) FindByIdentifier(identifier string) (*models.User, error) {
	if strings.Contains(identifier, "@") {
		return r.FindByEmail(identifier)
	}
	return r.FindByPhone(identifier)
}

func (r *UserRepository) findBy(query string, arg any) (*models.User, error) {
	var user models.User
	if err := r.db.Where(query, arg).First(&user).Error; err != nil {
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
