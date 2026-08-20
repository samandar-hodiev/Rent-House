package models

import (
	"time"

	"github.com/google/uuid"
)

// What a verification is for. Registration is the only purpose in use;
// password reset is listed because the table is designed to carry it later.
const (
	VerificationPurposeRegistration  = "registration"
	VerificationPurposePasswordReset = "password_reset"
)

// How the code reaches the user.
const (
	VerificationMethodPhone = "phone"
	VerificationMethodEmail = "email"
)

var (
	VerificationPurposes = []string{VerificationPurposeRegistration, VerificationPurposePasswordReset}
	VerificationMethods  = []string{VerificationMethodPhone, VerificationMethodEmail}
)

// AuthVerification is one verification attempt: the hashed code, how many times
// it has been guessed, and — once accepted — the short-lived token that lets
// registration continue.
//
// The plaintext code is never held here; only its bcrypt hash.
type AuthVerification struct {
	Base

	// Nil during registration: the account does not exist yet.
	UserID *uuid.UUID `gorm:"column:user_id;type:uuid" json:"user_id,omitempty"`

	Purpose string  `gorm:"column:purpose;type:varchar(20);not null" json:"purpose"`
	Method  string  `gorm:"column:method;type:varchar(10);not null" json:"method"`
	Phone   *string `gorm:"column:phone;type:varchar(32)" json:"phone,omitempty"`
	Email   *string `gorm:"column:email;type:varchar(255)" json:"email,omitempty"`

	CodeHash string `gorm:"column:code_hash;type:varchar(255);not null" json:"-"`

	Attempts  int16     `gorm:"column:attempts;not null;default:0" json:"attempts"`
	ExpiresAt time.Time `gorm:"column:expires_at;not null" json:"expires_at"`

	VerifiedAt *time.Time `gorm:"column:verified_at" json:"verified_at,omitempty"`
	ConsumedAt *time.Time `gorm:"column:consumed_at" json:"consumed_at,omitempty"`

	RegistrationTokenHash      *string    `gorm:"column:registration_token_hash;type:varchar(64)" json:"-"`
	RegistrationTokenExpiresAt *time.Time `gorm:"column:registration_token_expires_at" json:"-"`

	LastSentAt time.Time `gorm:"column:last_sent_at;not null;default:now()" json:"last_sent_at"`

	Timestamps
}

func (AuthVerification) TableName() string { return "auth_verifications" }

// Contact returns the destination the code was sent to.
func (v *AuthVerification) Contact() string {
	if v.Method == VerificationMethodPhone && v.Phone != nil {
		return *v.Phone
	}
	if v.Email != nil {
		return *v.Email
	}
	return ""
}

// IsExpired reports whether the code's window has closed.
func (v *AuthVerification) IsExpired(now time.Time) bool { return now.After(v.ExpiresAt) }

// IsConsumed reports whether the row has already been spent. A consumed row is
// never accepted again, which is what prevents replaying an OTP or a token.
func (v *AuthVerification) IsConsumed() bool { return v.ConsumedAt != nil }

// IsVerified reports whether the correct code has been entered.
func (v *AuthVerification) IsVerified() bool { return v.VerifiedAt != nil }

// IsTokenExpired reports whether the registration token's window has closed.
func (v *AuthVerification) IsTokenExpired(now time.Time) bool {
	return v.RegistrationTokenExpiresAt == nil || now.After(*v.RegistrationTokenExpiresAt)
}
