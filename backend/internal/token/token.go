// Package token issues and verifies JWT access tokens.
//
// It is separate from the auth service and from the HTTP middleware because
// both need it and neither should own it: the service mints a token after
// checking credentials, the middleware verifies one on every protected request.
package token

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Audiences a token can be minted for. They are separate systems with separate
// accounts, and a token for one must never open the other.
const (
	ScopeUser  = "renthouse:user"
	ScopeAdmin = "renthouse:admin"
)

// hasScope reports whether the audience list contains the scope. An empty
// audience is the user scope: tokens minted before scopes existed have none.
func hasScope(audience jwt.ClaimStrings, scope string) bool {
	if len(audience) == 0 {
		return scope == ScopeUser
	}
	for _, value := range audience {
		if value == scope {
			return true
		}
	}
	return false
}

// Errors a caller can act on. Everything else is wrapped and reported as an
// invalid token, so a client cannot learn why parsing failed.
var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token expired")
)

// signingMethod is fixed. Accepting whatever a token's header claims would let
// an attacker present "alg":"none", or an RS256 token signed with the public
// key as an HMAC secret.
var signingMethod = jwt.SigningMethodHS256

// Service mints and verifies access tokens.
type Service struct {
	secret    []byte
	expiresIn time.Duration
}

// New builds a Service. The secret must be non-empty — an empty signing key
// would produce tokens anyone could forge.
func New(secret string, expiresIn time.Duration) (*Service, error) {
	if secret == "" {
		return nil, errors.New("jwt secret must not be empty")
	}
	if expiresIn <= 0 {
		return nil, errors.New("jwt expiry must be positive")
	}
	return &Service{secret: []byte(secret), expiresIn: expiresIn}, nil
}

// ExpiresIn reports the configured token lifetime, so a handler can tell the
// client how long its token is good for without recomputing it.
func (s *Service) ExpiresIn() time.Duration { return s.expiresIn }

// Generate mints an access token for the given user.
//
// Claims are deliberately minimal: the subject plus issue and expiry times. A
// JWT is readable by anyone holding it, so it carries an identifier and nothing
// else — no email, no phone, no profile data.
func (s *Service) Generate(userID uuid.UUID) (string, time.Time, error) {
	return s.GenerateScoped(userID, ScopeUser, s.expiresIn)
}

// GenerateScoped mints a token for one audience and no other.
//
// The scope is the JWT audience. It is what stops a marketplace user's token
// from being presented to the admin API: both are signed with the same secret,
// so without it a valid token from either side would verify on the other. A
// separate secret would do the same job, but then two secrets have to be
// deployed, rotated and kept in step.
func (s *Service) GenerateScoped(
	subject uuid.UUID, scope string, expiresIn time.Duration,
) (string, time.Time, error) {
	now := time.Now()
	expiresAt := now.Add(expiresIn)

	claims := jwt.RegisteredClaims{
		Subject:   subject.String(),
		Audience:  jwt.ClaimStrings{scope},
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(expiresAt),
	}

	signed, err := jwt.NewWithClaims(signingMethod, claims).SignedString(s.secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}
	return signed, expiresAt, nil
}

// Validate verifies a token and returns the user it identifies.
//
// It checks the signature, the signing algorithm, the expiry, and that the
// subject is a well-formed UUID. A token that passes has not been tampered
// with, but says nothing about whether the user still exists — the caller
// decides whether that matters.
func (s *Service) Validate(raw string) (uuid.UUID, error) {
	return s.ValidateScoped(raw, ScopeUser)
}

// ValidateScoped verifies a token and requires it to have been minted for the
// given audience.
//
// A token with no audience counts as ScopeUser. Tokens issued before scopes
// existed carry none, and treating them as user tokens keeps every signed-in
// visitor signed in — while still refusing them at the admin API, which asks
// for ScopeAdmin.
func (s *Service) ValidateScoped(raw, scope string) (uuid.UUID, error) {
	claims := &jwt.RegisteredClaims{}

	_, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != signingMethod.Alg() {
			return nil, fmt.Errorf("unexpected signing method %q", t.Method.Alg())
		}
		return s.secret, nil
	}, jwt.WithValidMethods([]string{signingMethod.Alg()}))

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return uuid.Nil, ErrExpiredToken
		}
		return uuid.Nil, ErrInvalidToken
	}

	if claims.Subject == "" {
		return uuid.Nil, ErrInvalidToken
	}

	if !hasScope(claims.Audience, scope) {
		return uuid.Nil, ErrInvalidToken
	}

	userID, err := uuid.Parse(claims.Subject)
	if err != nil || userID == uuid.Nil {
		return uuid.Nil, ErrInvalidToken
	}
	return userID, nil
}
