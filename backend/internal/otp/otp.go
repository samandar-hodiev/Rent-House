// Package otp generates and checks one-time codes.
package otp

import (
	"crypto/rand"
	"fmt"
	"math/big"

	"golang.org/x/crypto/bcrypt"
)

// Length is fixed at six digits: what the UI asks for and what users expect.
const Length = 6

// hashCost is bcrypt's default. A six-digit code has a small keyspace, so the
// real defences are the five-minute window and the attempt limit; bcrypt here
// buys time if the table ever leaks, without adding a quarter second to every
// verification the way cost 12 would.
const hashCost = bcrypt.DefaultCost

// max is the exclusive upper bound: 1000000, giving 000000–999999.
var max = big.NewInt(1000000)

// Generate returns a cryptographically random six-digit code.
//
// crypto/rand, never math/rand: a predictable code can be guessed without ever
// seeing the SMS.
func Generate() (string, error) {
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", fmt.Errorf("generate otp: %w", err)
	}
	// Zero-padded, so "42" is sent as "000042" and stays six digits.
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// Hash returns the bcrypt hash of a code, for storage.
func Hash(code string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(code), hashCost)
	if err != nil {
		return "", fmt.Errorf("hash otp: %w", err)
	}
	return string(hash), nil
}

// Matches reports whether a submitted code matches a stored hash. The
// comparison is constant-time with respect to the hash.
func Matches(hash, code string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(code)) == nil
}

// IsWellFormed reports whether a string is exactly six digits. Checked before
// the hash comparison so obviously malformed input costs nothing.
func IsWellFormed(code string) bool {
	if len(code) != Length {
		return false
	}
	for _, r := range code {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
