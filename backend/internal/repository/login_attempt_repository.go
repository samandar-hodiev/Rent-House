package repository

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// LoginAttempt counts recent failures for one identifier.
type LoginAttempt struct {
	Identifier  string     `gorm:"column:identifier;primaryKey"`
	Failures    int        `gorm:"column:failures"`
	LockedUntil *time.Time `gorm:"column:locked_until"`
	UpdatedAt   time.Time  `gorm:"column:updated_at"`
}

func (LoginAttempt) TableName() string { return "login_attempts" }

// LoginAttemptRepository records failed sign-ins so a lockout can be enforced.
type LoginAttemptRepository struct {
	db *gorm.DB
}

func NewLoginAttemptRepository(db *gorm.DB) *LoginAttemptRepository {
	return &LoginAttemptRepository{db: db}
}

// LockedUntil returns when the lock on this identifier lifts, or the zero time
// when it is not locked.
func (r *LoginAttemptRepository) LockedUntil(
	ctx context.Context, identifier string, now time.Time,
) (time.Time, error) {
	var row LoginAttempt
	err := r.db.WithContext(ctx).Where("identifier = ?", identifier).First(&row).Error
	switch {
	case err == gorm.ErrRecordNotFound:
		return time.Time{}, nil
	case err != nil:
		return time.Time{}, fmt.Errorf("read login attempts: %w", err)
	}
	if row.LockedUntil == nil || !row.LockedUntil.After(now) {
		return time.Time{}, nil
	}
	return *row.LockedUntil, nil
}

// Fail records one failed attempt and locks the identifier once the allowance
// is used up. It returns when the lock lifts, or the zero time if it does not.
//
// One statement: two callers failing at the same moment must produce two
// failures, not one, and a read-then-write would lose one of them.
func (r *LoginAttemptRepository) Fail(
	ctx context.Context, identifier string, maxAttempts int, lockFor time.Duration, now time.Time,
) (time.Time, error) {
	var row LoginAttempt
	err := r.db.WithContext(ctx).Raw(`
		INSERT INTO login_attempts (identifier, failures, locked_until, updated_at)
		VALUES (?, 1, NULL, ?::timestamptz)
		ON CONFLICT (identifier) DO UPDATE SET
			failures = CASE
				-- A lock that has expired starts the count again, so an old
				-- lockout does not make the next mistake instantly fatal.
				WHEN login_attempts.locked_until IS NOT NULL
				     AND login_attempts.locked_until <= ?::timestamptz
				THEN 1
				ELSE login_attempts.failures + 1
			END,
			-- The casts are not decoration: both arms of a CASE have to agree
			-- on a type, and an untyped parameter beside NULL is read as text.
			locked_until = CASE
				WHEN (CASE
					WHEN login_attempts.locked_until IS NOT NULL
					     AND login_attempts.locked_until <= ?::timestamptz
					THEN 1
					ELSE login_attempts.failures + 1
				END) >= ? THEN ?::timestamptz
				ELSE NULL::timestamptz
			END,
			updated_at = ?::timestamptz
		RETURNING identifier, failures, locked_until, updated_at`,
		identifier, now, now, now, maxAttempts, now.Add(lockFor), now,
	).Scan(&row).Error
	if err != nil {
		return time.Time{}, fmt.Errorf("record failed login: %w", err)
	}
	if row.LockedUntil == nil {
		return time.Time{}, nil
	}
	return *row.LockedUntil, nil
}

// Succeed clears the record: a correct password ends the streak.
func (r *LoginAttemptRepository) Succeed(ctx context.Context, identifier string) error {
	err := r.db.WithContext(ctx).
		Where("identifier = ?", identifier).Delete(&LoginAttempt{}).Error
	if err != nil {
		return fmt.Errorf("clear login attempts: %w", err)
	}
	return nil
}
