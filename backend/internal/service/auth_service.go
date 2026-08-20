// Package service holds the business rules. Handlers deal in HTTP, repositories
// deal in SQL; everything in between lives here.
package service

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
)

// Errors the handler maps onto status codes.
var (
	// ErrInvalidCredentials covers every failed sign-in: unknown email, unknown
	// phone, wrong password. One error for all three is deliberate — a
	// distinguishable "no such user" turns the login form into a way to test
	// whether an address is registered.
	ErrInvalidCredentials = errors.New("invalid credentials")

	// ErrUserExists means email or phone is already taken. Which one is not
	// reported, for the same reason.
	ErrUserExists = errors.New("user already exists")

	ErrUserNotFound = errors.New("user not found")
)

// bcryptCost is above bcrypt.DefaultCost (10). Each increment doubles the work
// an attacker must repeat per guess; 12 is a common production setting and
// costs roughly a quarter of a second per hash on current hardware.
const bcryptCost = 12

// AuthService registers users and signs them in.
type AuthService struct {
	users  *repository.UserRepository
	tokens *token.Service
}

func NewAuthService(users *repository.UserRepository, tokens *token.Service) *AuthService {
	return &AuthService{users: users, tokens: tokens}
}

// Register creates an account and returns it with a fresh access token.
//
// The request is expected to be normalized and validated already; this method
// owns the rules that need the database or a secret — hashing and uniqueness.
func (s *AuthService) Register(req dto.RegisterRequest) (*dto.AuthResponse, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcryptCost)
	if err != nil {
		// Includes the >72-byte case, which validation should already reject.
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user := &models.User{
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Email:        req.Email,
		Phone:        req.Phone,
		PasswordHash: string(hash),
		Language:     req.Language,
		Theme:        models.ThemeLight,
	}

	if err := s.users.Create(user); err != nil {
		if errors.Is(err, repository.ErrDuplicateUser) {
			return nil, ErrUserExists
		}
		return nil, err
	}

	return s.authResponse(user)
}

// Login verifies credentials and returns the user with an access token.
func (s *AuthService) Login(req dto.LoginRequest) (*dto.AuthResponse, error) {
	user, err := s.users.FindByIdentifier(req.Identifier)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			// Hash the supplied password anyway. Returning immediately would
			// make "unknown user" measurably faster than "wrong password",
			// which leaks account existence through response time.
			_, _ = bcrypt.GenerateFromPassword([]byte(req.Password), bcryptCost)
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	// CompareHashAndPassword is constant-time with respect to the hash.
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	return s.authResponse(user)
}

// CurrentUser loads the user behind a validated token.
//
// A token can outlive the account it names, so the lookup happens here rather
// than being assumed from the token's claims.
func (s *AuthService) CurrentUser(userID uuid.UUID) (*dto.UserResponse, error) {
	user, err := s.users.FindByID(userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	response := dto.NewUserResponse(user)
	return &response, nil
}

func (s *AuthService) authResponse(user *models.User) (*dto.AuthResponse, error) {
	accessToken, _, err := s.tokens.Generate(user.ID)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	return &dto.AuthResponse{
		User:        dto.NewUserResponse(user),
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   int64(s.tokens.ExpiresIn().Seconds()),
	}, nil
}
