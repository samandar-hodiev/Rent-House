//go:build integration

// The sign-in lockout the settings page configures.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run Lockout
package handler

import (
	"testing"
	"time"

	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
)

func TestLoginLockoutCountsAndClears(t *testing.T) {
	h := newAdminHarness(t)
	attempts := repository.NewLoginAttemptRepository(h.tx)
	now := time.Now().UTC()

	const identifier = "lockout-test@renthouse.test"
	const maxAttempts = 3
	const lockFor = 15 * time.Minute

	// Below the allowance: counted, not locked.
	for i := 1; i < maxAttempts; i++ {
		until, err := attempts.Fail(t.Context(), identifier, maxAttempts, lockFor, now)
		if err != nil {
			t.Fatalf("failure %d: %v", i, err)
		}
		if !until.IsZero() {
			t.Fatalf("locked after %d of %d attempts", i, maxAttempts)
		}
	}

	// The last one locks, and the lock is the configured length.
	until, err := attempts.Fail(t.Context(), identifier, maxAttempts, lockFor, now)
	if err != nil {
		t.Fatalf("final failure: %v", err)
	}
	if until.IsZero() {
		t.Fatal("not locked after using the whole allowance")
	}
	if got := until.Sub(now).Round(time.Minute); got != lockFor {
		t.Fatalf("lock length: got %v, want %v", got, lockFor)
	}

	// And the lock is what a sign-in sees.
	locked, err := attempts.LockedUntil(t.Context(), identifier, now)
	if err != nil {
		t.Fatalf("read lock: %v", err)
	}
	if locked.IsZero() {
		t.Fatal("the lock is not visible to the sign-in path")
	}

	// It lifts on its own.
	lifted, err := attempts.LockedUntil(t.Context(), identifier, now.Add(lockFor+time.Minute))
	if err != nil {
		t.Fatalf("read lock after expiry: %v", err)
	}
	if !lifted.IsZero() {
		t.Fatal("the lock did not lift")
	}

	// A correct password ends the streak.
	if err := attempts.Succeed(t.Context(), identifier); err != nil {
		t.Fatalf("clear: %v", err)
	}
	cleared, err := attempts.LockedUntil(t.Context(), identifier, now)
	if err != nil {
		t.Fatalf("read after clear: %v", err)
	}
	if !cleared.IsZero() {
		t.Fatal("the record survived a successful sign-in")
	}
}
