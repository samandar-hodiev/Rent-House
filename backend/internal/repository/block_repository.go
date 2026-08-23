package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// BlockRepository stores who has blocked whom.
type BlockRepository struct {
	db *gorm.DB
}

func NewBlockRepository(db *gorm.DB) *BlockRepository {
	return &BlockRepository{db: db}
}

// Block records that one user has blocked another.
//
// Idempotent by way of the unique constraint rather than a check-then-insert:
// blocking twice is the same block, and a double tap or a retried request must
// not become an error shown to someone who already got what they asked for. A
// repeat updates the reason, because the second attempt is the more recent
// statement of why.
func (r *BlockRepository) Block(ctx context.Context, block *models.UserBlock) error {
	err := r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "blocker_id"}, {Name: "blocked_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"reason", "reason_text"}),
		}).
		Create(block).Error
	if err != nil {
		return fmt.Errorf("block user: %w", err)
	}
	return nil
}

// Unblock removes one user's block on another. Unblocking someone who was never
// blocked is not an error — the caller asked for the block to be gone, and it is.
func (r *BlockRepository) Unblock(ctx context.Context, blockerID, blockedID uuid.UUID) error {
	err := r.db.WithContext(ctx).
		Where("blocker_id = ? AND blocked_id = ?", blockerID, blockedID).
		Delete(&models.UserBlock{}).Error
	if err != nil {
		return fmt.Errorf("unblock user: %w", err)
	}
	return nil
}

// BlockState is what one person needs to know about their standing with
// another: whether they did the blocking, and whether they were blocked.
//
// Both are reported because they mean different things to the interface. The
// first offers a way to undo it; the second only explains why sending fails.
type BlockState struct {
	IBlockedThem  bool
	TheyBlockedMe bool
}

// Any reports whether communication is barred in either direction, which is the
// only question the send path needs answered.
func (s BlockState) Any() bool { return s.IBlockedThem || s.TheyBlockedMe }

// StateBetween reads both directions in one query.
//
// One round trip rather than two: this runs on every message send, and the
// answer is a pair of booleans either way.
func (r *BlockRepository) StateBetween(
	ctx context.Context, viewerID, otherID uuid.UUID,
) (BlockState, error) {
	var rows []models.UserBlock
	err := r.db.WithContext(ctx).
		Select("blocker_id", "blocked_id").
		Where("(blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
			viewerID, otherID, otherID, viewerID).
		Find(&rows).Error
	if err != nil {
		return BlockState{}, fmt.Errorf("read block state: %w", err)
	}

	var state BlockState
	for _, row := range rows {
		if row.BlockerID == viewerID {
			state.IBlockedThem = true
		} else {
			state.TheyBlockedMe = true
		}
	}
	return state, nil
}

// BlockedEither returns every user this one cannot exchange messages with —
// people they blocked and people who blocked them.
//
// One query for a whole conversation list, so rendering twenty threads does not
// mean twenty block lookups.
func (r *BlockRepository) BlockedEither(
	ctx context.Context, userID uuid.UUID,
) (map[uuid.UUID]BlockState, error) {
	var rows []models.UserBlock
	err := r.db.WithContext(ctx).
		Select("blocker_id", "blocked_id").
		Where("blocker_id = ? OR blocked_id = ?", userID, userID).
		Find(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("list blocks: %w", err)
	}

	states := make(map[uuid.UUID]BlockState, len(rows))
	for _, row := range rows {
		if row.BlockerID == userID {
			state := states[row.BlockedID]
			state.IBlockedThem = true
			states[row.BlockedID] = state
			continue
		}
		state := states[row.BlockerID]
		state.TheyBlockedMe = true
		states[row.BlockerID] = state
	}
	return states, nil
}

// BlockedUser is one row of the blocked-users list: who they are, when they
// were blocked, and why — if a reason was given.
type BlockedUser struct {
	UserID     uuid.UUID
	FirstName  string
	LastName   string
	AvatarURL  *string
	Reason     *string
	ReasonText *string
	CreatedAt  time.Time
}

// ListBlocked returns everyone this user has blocked, most recent first.
//
// Only blocks this user made: somebody who blocked *them* does not appear, and
// is not theirs to lift.
func (r *BlockRepository) ListBlocked(
	ctx context.Context, userID uuid.UUID,
) ([]BlockedUser, error) {
	rows := []BlockedUser{}
	err := r.db.WithContext(ctx).
		Table("user_blocks AS b").
		Select(`u.id AS user_id, u.first_name, u.last_name, u.avatar_url,
		        b.reason, b.reason_text, b.created_at`).
		Joins("JOIN users AS u ON u.id = b.blocked_id").
		Where("b.blocker_id = ?", userID).
		Order("b.created_at DESC").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("list blocked users: %w", err)
	}
	return rows, nil
}
