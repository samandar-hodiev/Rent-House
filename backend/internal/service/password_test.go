package service

import (
	"errors"
	"strings"
	"testing"
)

func TestValidatePassword(t *testing.T) {
	cases := []struct {
		name     string
		policy   PasswordPolicy
		password string
		wantErr  bool
	}{
		{"default minimum", PasswordPolicy{MinLength: 8}, "abcdefgh", false},
		{"one short", PasswordPolicy{MinLength: 8}, "abcdefg", true},
		{"configured minimum is obeyed", PasswordPolicy{MinLength: 12}, "abcdefghij", true},
		{"configured minimum is met", PasswordPolicy{MinLength: 12}, "abcdefghijkl", false},
		{"strong: all three classes", PasswordPolicy{MinLength: 8, RequireStrong: true}, "Abcdefg1", false},
		{"strong: no digit", PasswordPolicy{MinLength: 8, RequireStrong: true}, "Abcdefgh", true},
		{"strong: no upper case", PasswordPolicy{MinLength: 8, RequireStrong: true}, "abcdefg1", true},
		{"strong is off by default", PasswordPolicy{MinLength: 8}, "abcdefgh", false},
		// bcrypt reads the first 72 bytes and ignores the rest, so accepting
		// more would store less strength than it promised.
		{"past bcrypt's ceiling", PasswordPolicy{MinLength: 8}, strings.Repeat("a", 73), true},
		// A policy with no minimum must not mean "no rule at all".
		{"unset minimum falls back", PasswordPolicy{}, "abc", true},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			err := ValidatePassword(testCase.policy, testCase.password)
			if testCase.wantErr {
				if !errors.Is(err, ErrWeakPassword) {
					t.Fatalf("got %v, want ErrWeakPassword", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("got %v, want no error", err)
			}
		})
	}
}
