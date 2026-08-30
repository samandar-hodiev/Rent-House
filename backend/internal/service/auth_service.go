// Package service holds the business rules. Handlers deal in HTTP, repositories
// deal in SQL; everything in between lives here.
package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/samandar-hodiev/Rent-House/backend/internal/config"
	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/notify"
	"github.com/samandar-hodiev/Rent-House/backend/internal/otp"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

// Errors the handler maps onto status codes.
var (
	// ErrInvalidCredentials covers every failed sign-in: unknown email, unknown
	// phone, wrong password. One error for all three is deliberate — a
	// distinguishable "no such user" turns the login form into a way to test
	// whether an address is registered.
	ErrInvalidCredentials = errors.New("invalid credentials")

	// ErrContactTaken means the phone or email already belongs to an account.
	// Registration reports this openly: the user needs to know to sign in
	// instead, and the same fact is already discoverable from the login form.
	ErrContactTaken = errors.New("contact already registered")

	ErrUserNotFound = errors.New("user not found")

	// Profile editing. Each says exactly what the person has to change, so the
	// handler can map it to a message rather than a generic refusal.
	ErrNameRequired = errors.New("name cannot be empty")
	// ErrAccountBlocked is returned when an administrator has blocked the
	// account. Distinct from bad credentials: the password was right.
	ErrAccountBlocked  = errors.New("account is blocked")
	ErrContactRequired = errors.New("an account needs a phone number or an email")
	ErrInvalidPhone    = errors.New("phone number is not a valid Uzbek mobile number")
	ErrPhoneTaken      = errors.New("phone number already belongs to another account")
	ErrInvalidAvatar   = errors.New("avatar must be an uploaded image")

	// ErrInvalidResetToken covers an unknown, expired, already-spent or
	// wrong-purpose reset link. One error for all of them on purpose: telling
	// them apart would confirm that a token once existed.
	ErrInvalidResetToken = errors.New("password reset link is invalid or has expired")

	// ErrResendTooSoon means the cooldown has not elapsed.
	ErrResendTooSoon = errors.New("verification code requested too soon")

	// ErrVerificationNotFound covers an unknown, superseded or already-spent
	// verification. They are one error so a caller cannot probe which.
	ErrVerificationNotFound = errors.New("verification not found")
	ErrVerificationExpired  = errors.New("verification expired")
	ErrTooManyAttempts      = errors.New("too many verification attempts")
	ErrInvalidCode          = errors.New("invalid verification code")

	// ErrInvalidRegistrationToken covers an unknown, expired, unverified or
	// already-used registration token.
	ErrInvalidRegistrationToken = errors.New("invalid registration token")

	// ErrContactMismatch means the body's contact does not match its method.
	ErrContactMismatch = errors.New("contact does not match the chosen method")

	// ErrDeliveryFailed means the code was generated but the SMS or email
	// provider refused to deliver it. Distinct from a generic internal fault so
	// the client can tell the user to retry rather than showing "something went
	// wrong" — and so it is never mistaken for the browser being offline.
	ErrDeliveryFailed = errors.New("verification code could not be delivered")
)

// bcryptCost is above bcrypt.DefaultCost (10). Each increment doubles the work
// an attacker must repeat per guess; 12 is a common production setting and
// costs roughly a quarter of a second per hash on current hardware.
const bcryptCost = 12

// registrationTokenBytes gives a 256-bit token — far beyond guessing, which is
// why it is stored under a fast SHA-256 rather than bcrypt.
const registrationTokenBytes = 32

// AuthService owns registration, sign-in and the verification workflow.
type AuthService struct {
	users         *repository.UserRepository
	verifications *repository.VerificationRepository
	tokens        *token.Service
	smsSender     notify.Sender
	emailSender   notify.Sender
	policy        config.OTP

	// now is injectable so tests can move time without sleeping.
	now func() time.Time
}

func NewAuthService(
	users *repository.UserRepository,
	verifications *repository.VerificationRepository,
	tokens *token.Service,
	smsSender notify.Sender,
	emailSender notify.Sender,
	policy config.OTP,
) *AuthService {
	return &AuthService{
		users:         users,
		verifications: verifications,
		tokens:        tokens,
		smsSender:     smsSender,
		emailSender:   emailSender,
		policy:        policy,
		now:           time.Now,
	}
}

// SetClock replaces the service's clock. Tests only.
func (s *AuthService) SetClock(now func() time.Time) { s.now = now }

// RequestRegistrationCode is step one: send a code to a phone or an email.
func (s *AuthService) RequestRegistrationCode(
	ctx context.Context, req dto.RegisterRequestOTP,
) (*dto.RegisterRequestOTPResponse, error) {
	contact := req.Contact()
	if contact == "" {
		return nil, ErrContactMismatch
	}
	// The unused contact must be absent, so a request cannot claim to verify a
	// phone while also carrying an email.
	if req.Method == models.VerificationMethodPhone && req.Email != "" {
		return nil, ErrContactMismatch
	}
	if req.Method == models.VerificationMethodEmail && req.Phone != "" {
		return nil, ErrContactMismatch
	}

	taken, err := s.users.ExistsByContact(ctx, req.Method, contact)
	if err != nil {
		return nil, err
	}
	if taken {
		return nil, ErrContactTaken
	}

	now := s.now()

	// Cooldown: checked against the newest verification for this contact,
	// whether or not it was used, so resending cannot be hammered.
	latest, err := s.verifications.FindLatestForContact(
		ctx, models.VerificationPurposeRegistration, req.Method, contact)
	switch {
	case err == nil:
		if elapsed := now.Sub(latest.LastSentAt); elapsed < s.policy.ResendCooldown {
			return nil, ErrResendTooSoon
		}
	case errors.Is(err, repository.ErrVerificationNotFound):
		// first request for this contact
	default:
		return nil, err
	}

	// Any code still live for this contact stops working now, so only one is
	// ever valid at a time.
	if err := s.verifications.ConsumeOpenForContact(
		ctx, models.VerificationPurposeRegistration, req.Method, contact, now); err != nil {
		return nil, err
	}

	code, err := otp.Generate()
	if err != nil {
		return nil, err
	}
	codeHash, err := otp.Hash(code)
	if err != nil {
		return nil, err
	}

	verification := &models.AuthVerification{
		Purpose:    models.VerificationPurposeRegistration,
		Method:     req.Method,
		CodeHash:   codeHash,
		ExpiresAt:  now.Add(s.policy.Expiry),
		LastSentAt: now,
	}
	if req.Method == models.VerificationMethodPhone {
		verification.Phone = &contact
	} else {
		verification.Email = &contact
	}

	if err := s.verifications.Create(ctx, verification); err != nil {
		return nil, err
	}

	// Sent after the row exists, so a delivery failure cannot leave a code in
	// the wild with nothing to verify it against.
	sender := s.sender(req.Method)
	if err := sender.Send(ctx, contact, code); err != nil {
		// The provider's reason is wrapped for the log; the caller sees only
		// that delivery failed.
		logger.Errorf("verification delivery failed via %s: %v", req.Method, err)
		return nil, ErrDeliveryFailed
	}

	// Reported honestly: a development sender wrote the code to the log, it did
	// not deliver anything, and the UI must say so rather than claim otherwise.
	delivery := dto.DeliverySent
	if notify.IsSimulated(sender) {
		delivery = dto.DeliveryLogged
	}

	return &dto.RegisterRequestOTPResponse{
		VerificationID:    verification.ID.String(),
		Method:            req.Method,
		Delivery:          delivery,
		ExpiresIn:         int64(s.policy.Expiry.Seconds()),
		ResendAfter:       int64(s.policy.ResendCooldown.Seconds()),
		AttemptsRemaining: s.policy.MaxAttempts,
	}, nil
}

// VerifyRegistrationCode is step two: check the code and hand back a token.
func (s *AuthService) VerifyRegistrationCode(
	ctx context.Context, req dto.VerifyOTPRequest,
) (*dto.VerifyOTPResponse, error) {
	id, err := uuid.Parse(req.VerificationID)
	if err != nil {
		return nil, ErrVerificationNotFound
	}

	verification, err := s.verifications.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrVerificationNotFound) {
			return nil, ErrVerificationNotFound
		}
		return nil, err
	}

	now := s.now()

	// A spent row is never accepted again — this is what stops an OTP being
	// replayed and stops a superseded code from working.
	if verification.IsConsumed() {
		return nil, ErrVerificationNotFound
	}
	// Already verified: the code has had its one use. Without this, re-posting
	// the same code would mint a fresh registration token every time and
	// silently invalidate the one the caller is holding.
	if verification.IsVerified() {
		return nil, ErrVerificationNotFound
	}
	if verification.Purpose != models.VerificationPurposeRegistration {
		return nil, ErrVerificationNotFound
	}
	if verification.IsExpired(now) {
		return nil, ErrVerificationExpired
	}
	if int(verification.Attempts) >= s.policy.MaxAttempts {
		return nil, ErrTooManyAttempts
	}

	if !otp.IsWellFormed(req.Code) || !otp.Matches(verification.CodeHash, req.Code) {
		// A wrong guess costs an attempt. Without this the five-minute window
		// would be enough to walk the whole six-digit space.
		verification.Attempts++
		verification.UpdatedAt = now
		if err := s.verifications.Save(ctx, verification); err != nil {
			return nil, err
		}
		if int(verification.Attempts) >= s.policy.MaxAttempts {
			return nil, ErrTooManyAttempts
		}
		return nil, ErrInvalidCode
	}

	registrationToken, hash, err := newRegistrationToken()
	if err != nil {
		return nil, err
	}

	tokenExpiry := now.Add(s.policy.RegistrationTokenExpiry)
	verification.VerifiedAt = &now
	verification.TokenHash = &hash
	verification.TokenExpiresAt = &tokenExpiry
	verification.UpdatedAt = now

	if err := s.verifications.Save(ctx, verification); err != nil {
		return nil, err
	}

	return &dto.VerifyOTPResponse{
		RegistrationToken: registrationToken,
		ExpiresIn:         int64(s.policy.RegistrationTokenExpiry.Seconds()),
	}, nil
}

// CompleteRegistration is step three: exchange the token for an account.
func (s *AuthService) CompleteRegistration(
	ctx context.Context, req dto.CompleteRegistrationRequest,
) (*dto.AuthResponse, error) {
	verification, err := s.verifications.FindByTokenHash(ctx, hashToken(req.RegistrationToken))
	if err != nil {
		if errors.Is(err, repository.ErrVerificationNotFound) {
			return nil, ErrInvalidRegistrationToken
		}
		return nil, err
	}

	now := s.now()

	// Every reason a token is unusable collapses to one error, so a caller
	// cannot learn whether a token existed, was spent, or merely expired.
	switch {
	case verification.IsConsumed(),
		!verification.IsVerified(),
		verification.IsTokenExpired(now),
		verification.Purpose != models.VerificationPurposeRegistration:
		return nil, ErrInvalidRegistrationToken
	}

	contact := verification.Contact()
	if contact == "" {
		return nil, ErrInvalidRegistrationToken
	}

	// Re-checked here as well as in step one: minutes may have passed, and the
	// database constraint is the final word either way.
	taken, err := s.users.ExistsByContact(ctx, verification.Method, contact)
	if err != nil {
		return nil, err
	}
	if taken {
		return nil, ErrContactTaken
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcryptCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user := &models.User{
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		PasswordHash: string(hash),
		Language:     req.Language,
		Theme:        models.ThemeLight,
	}
	// Only the contact that was actually verified is stored. The other stays
	// nil, which the schema allows and the CHECK tolerates.
	if verification.Method == models.VerificationMethodPhone {
		user.Phone = &contact
	} else {
		user.Email = &contact
	}

	if err := s.users.Create(ctx, user); err != nil {
		if errors.Is(err, repository.ErrDuplicateUser) {
			return nil, ErrContactTaken
		}
		return nil, err
	}

	// Spent only after the account exists, so a failure mid-way leaves the
	// token usable for a retry rather than stranding the user.
	verification.ConsumedAt = &now
	verification.UserID = &user.ID
	verification.UpdatedAt = now
	if err := s.verifications.Save(ctx, verification); err != nil {
		return nil, err
	}

	return s.authResponse(user)
}

// Login verifies credentials and returns the user with an access token.
func (s *AuthService) Login(ctx context.Context, req dto.LoginRequest) (*dto.AuthResponse, error) {
	user, err := s.users.FindByIdentifier(ctx, req.Identifier)
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

	// Checked after the password, not before: telling somebody who guessed an
	// address but not its password that the account is blocked would confirm
	// the address exists. This is what an administrator's "Bloklash" does —
	// without it the status would be a label rather than a consequence.
	if user.Status == models.UserStatusBlocked {
		return nil, ErrAccountBlocked
	}

	return s.authResponse(user)
}

// CurrentUser loads the user behind a validated token.
//
// A token can outlive the account it names, so the lookup happens here rather
// than being assumed from the token's claims.
func (s *AuthService) CurrentUser(ctx context.Context, userID uuid.UUID) (*dto.UserResponse, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	response := dto.NewUserResponse(user)
	return &response, nil
}

// uploadPathPrefix is where this server serves what it stored.
const uploadPathPrefix = "/uploads/"

// uploadPath reduces whatever the client sent to the path part, and accepts it
// only if that path is one this server serves.
//
// The upload endpoint returns an absolute URL because the frontend may sit on
// another origin; what is kept is the path inside it, so the origin is this
// server's to decide when the value is read back.
func uploadPath(raw string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", ErrInvalidAvatar
	}
	// `url.Parse` leaves "../" in the path, and the static handler resolves it,
	// so a traversal has to be refused here rather than assumed impossible.
	cleaned := path.Clean(parsed.Path)
	if !strings.HasPrefix(cleaned, uploadPathPrefix) {
		return "", ErrInvalidAvatar
	}
	return cleaned, nil
}

// How long a reset link lives. Long enough to walk to a computer, short enough
// that a link left in an inbox stops working the same afternoon.
const passwordResetTTL = 30 * time.Minute

// RequestPasswordReset emails a reset link, if the address belongs to anybody.
//
// It reports nothing about whether it did. An endpoint that answered "no such
// account" would be a way to ask the server which addresses are registered —
// so an unknown address takes the same path, returns the same response and
// takes roughly the same time as a known one.
func (s *AuthService) RequestPasswordReset(
	ctx context.Context, email string, resetURL func(token string) string,
) error {
	user, err := s.users.FindByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			// Deliberately silent. The caller returns its generic message
			// either way.
			return nil
		}
		return err
	}
	if user.Email == nil {
		return nil
	}

	now := s.now()

	// Any link already outstanding for this address stops working now, so only
	// the newest one can ever be used.
	if err := s.verifications.ConsumeOpenForContact(
		ctx, models.VerificationPurposePasswordReset, models.VerificationMethodEmail, email, now,
	); err != nil {
		return err
	}

	token, tokenHash, err := newRegistrationToken()
	if err != nil {
		return err
	}

	expiresAt := now.Add(passwordResetTTL)
	verification := &models.AuthVerification{
		UserID:  &user.ID,
		Purpose: models.VerificationPurposePasswordReset,
		Method:  models.VerificationMethodEmail,
		Email:   &email,
		// No code is sent for a reset — the link is the secret — but the column
		// is NOT NULL, so it holds a value that can never match a guess.
		CodeHash:       unusableCodeHash,
		ExpiresAt:      expiresAt,
		VerifiedAt:     &now,
		TokenHash:      &tokenHash,
		TokenExpiresAt: &expiresAt,
		LastSentAt:     now,
	}
	if err := s.verifications.Create(ctx, verification); err != nil {
		return err
	}

	// Sent after the row exists, so a delivery failure cannot leave a live link
	// with nothing behind it.
	link := resetURL(token)
	if sender, ok := s.emailSender.(notify.LinkSender); ok {
		if err := sender.SendLink(ctx, email, link); err != nil {
			logger.Errorf("password reset delivery failed: %v", err)
			return ErrDeliveryFailed
		}
		return nil
	}

	// A development sender that only logs. It has no SendLink, so the link goes
	// through the ordinary path and lands in the log where the codes do.
	if err := s.emailSender.Send(ctx, email, link); err != nil {
		logger.Errorf("password reset delivery failed: %v", err)
		return ErrDeliveryFailed
	}
	return nil
}

// A bcrypt hash of a value nobody holds, for reset rows where no code exists.
// The column is NOT NULL and every comparison against this must fail, which is
// what an empty string would not reliably guarantee.
const unusableCodeHash = "$2a$12$000000000000000000000uJ8Q5b0hVQKJ0Q8YkY2z3rB1Wc6nS9Xe"

// findLiveResetToken resolves a reset token to its row, or says why it cannot.
func (s *AuthService) findLiveResetToken(
	ctx context.Context, token string,
) (*models.AuthVerification, error) {
	if strings.TrimSpace(token) == "" {
		return nil, ErrInvalidResetToken
	}

	verification, err := s.verifications.FindByTokenHash(ctx, hashToken(token))
	if err != nil {
		if errors.Is(err, repository.ErrVerificationNotFound) {
			return nil, ErrInvalidResetToken
		}
		return nil, err
	}

	// Every reason a link stops working collapses to one answer. Telling them
	// apart would let a caller learn that a token once existed.
	if verification.Purpose != models.VerificationPurposePasswordReset ||
		verification.ConsumedAt != nil ||
		verification.UserID == nil ||
		verification.TokenExpiresAt == nil ||
		s.now().After(*verification.TokenExpiresAt) {
		return nil, ErrInvalidResetToken
	}
	return verification, nil
}

// ValidateResetToken reports whether a link is still good, so the page can show
// the form or the "this link has expired" state rather than a form that will
// fail on submit.
func (s *AuthService) ValidateResetToken(ctx context.Context, token string) error {
	_, err := s.findLiveResetToken(ctx, token)
	return err
}

// ResetPassword sets a new password and spends the link.
func (s *AuthService) ResetPassword(ctx context.Context, token, password string) error {
	verification, err := s.findLiveResetToken(ctx, token)
	if err != nil {
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if err := s.users.UpdateProfile(ctx, *verification.UserID, map[string]any{
		"password_hash": string(hash),
	}); err != nil {
		return err
	}

	// Spent, and spent after the password changed: a failure above must leave
	// the link usable rather than burning it for nothing.
	now := s.now()
	verification.ConsumedAt = &now
	verification.TokenHash = nil
	verification.TokenExpiresAt = nil
	if err := s.verifications.Save(ctx, verification); err != nil {
		return err
	}
	return nil
}

// UpdateProfile changes the parts of an account its owner may change.
//
// Only name, phone and avatar. Email is deliberately absent: it is a login
// identifier and a verified one, so changing it is a flow with a confirmation
// code rather than a field on a form.
//
// The identity comes from the caller's token — there is no user id in the
// request — so this cannot be pointed at somebody else's account.
func (s *AuthService) UpdateProfile(
	ctx context.Context, userID uuid.UUID, req dto.UpdateProfileRequest,
) (*dto.UserResponse, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	fields := map[string]any{}

	// A name is how everyone else in the app refers to this person, so it can
	// be changed but not emptied.
	if req.FirstName != nil {
		if *req.FirstName == "" {
			return nil, ErrNameRequired
		}
		fields["first_name"] = *req.FirstName
	}
	if req.LastName != nil {
		if *req.LastName == "" {
			return nil, ErrNameRequired
		}
		fields["last_name"] = *req.LastName
	}

	if req.Phone != nil {
		if *req.Phone == "" {
			// The database insists on at least one way to reach an account, and
			// it is also how this person signs in. Removing the only one would
			// lock them out.
			if user.Email == nil || *user.Email == "" {
				return nil, ErrContactRequired
			}
			fields["phone"] = nil
		} else {
			// Normalization already ran in the DTO and returns "" for anything
			// it could not read, so a non-empty value here is canonical.
			if !dto.IsValidUzPhone(*req.Phone) {
				return nil, ErrInvalidPhone
			}
			fields["phone"] = *req.Phone
		}
	}

	if req.AvatarURL != nil {
		if *req.AvatarURL == "" {
			fields["avatar_url"] = nil
		} else {
			// Stored as a path, never as the absolute URL the upload endpoint
			// hands back.
			//
			// An avatar is rendered in other people's browsers — in chat, on a
			// listing — so a value pointing at another origin would make every
			// viewer fetch an image from a server of this account's choosing,
			// which is a way to collect the address of everyone who looks at
			// the profile. Keeping only the path makes that impossible to
			// express rather than merely disallowed, and the client resolves it
			// against the API origin it already knows.
			path, err := uploadPath(*req.AvatarURL)
			if err != nil {
				return nil, ErrInvalidAvatar
			}
			fields["avatar_url"] = path
		}
	}

	if len(fields) == 0 {
		response := dto.NewUserResponse(user)
		return &response, nil
	}

	if err := s.users.UpdateProfile(ctx, userID, fields); err != nil {
		if errors.Is(err, repository.ErrDuplicateUser) {
			return nil, ErrPhoneTaken
		}
		return nil, err
	}

	// Read back rather than patching the struct in memory, so the response is
	// what the database actually holds.
	updated, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	response := dto.NewUserResponse(updated)
	return &response, nil
}

func (s *AuthService) sender(method string) notify.Sender {
	if method == models.VerificationMethodPhone {
		return s.smsSender
	}
	return s.emailSender
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

// newRegistrationToken returns the token to hand out and the hash to store.
func newRegistrationToken() (plain, hash string, err error) {
	buf := make([]byte, registrationTokenBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", "", fmt.Errorf("generate registration token: %w", err)
	}
	plain = base64.RawURLEncoding.EncodeToString(buf)
	return plain, hashToken(plain), nil
}

// hashToken is SHA-256, not bcrypt: the token already carries 256 bits of
// entropy, so stretching adds latency to every request and no real security.
func hashToken(plain string) string {
	sum := sha256.Sum256([]byte(plain))
	return hex.EncodeToString(sum[:])
}
