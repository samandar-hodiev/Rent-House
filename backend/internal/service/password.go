package service

import (
	"errors"
	"fmt"
	"unicode"
)

// ErrWeakPassword is a password the configured policy refuses. One error for
// every rule, with the message saying which rule was broken — a form can only
// help somebody fix a password if it says what is wrong with it.
var ErrWeakPassword = errors.New("password does not meet the policy")

// minAdminPasswordLength is the floor used when no configuration can be read.
// It matches the marketplace's own minimum, so an administrator's password is
// never weaker than a visitor's.
const minAdminPasswordLength = 8

// maxPasswordLength is bcrypt's ceiling. Bytes past it are ignored by the
// algorithm, so accepting more would promise strength that is not stored.
const maxPasswordLength = 72

// ValidatePassword applies the configured policy.
//
// One implementation for every password the system takes — an administrator's,
// a visitor's, a reset — so "strong passwords required" cannot mean one thing
// on one form and another elsewhere.
func ValidatePassword(policy PasswordPolicy, password string) error {
	minimum := policy.MinLength
	if minimum < 1 {
		minimum = minAdminPasswordLength
	}
	if len(password) > maxPasswordLength {
		return fmt.Errorf("%w: at most %d characters", ErrWeakPassword, maxPasswordLength)
	}
	if len([]rune(password)) < minimum {
		return fmt.Errorf("%w: at least %d characters", ErrWeakPassword, minimum)
	}
	if !policy.RequireStrong {
		return nil
	}

	var hasUpper, hasLower, hasDigit bool
	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsDigit(char):
			hasDigit = true
		}
	}
	if !hasUpper || !hasLower || !hasDigit {
		return fmt.Errorf(
			"%w: use upper case, lower case and a digit", ErrWeakPassword)
	}
	return nil
}
