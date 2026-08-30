package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SiteSetting is one configured value.
//
// The value is text whatever it holds; `value_type` says how to read it back.
// The alternative — a column per setting — would mean a migration for every
// checkbox the marketplace grows.
type SiteSetting struct {
	Key       string     `gorm:"column:key;primaryKey"`
	Value     string     `gorm:"column:value"`
	ValueType string     `gorm:"column:value_type"`
	Category  string     `gorm:"column:category"`
	UpdatedBy *uuid.UUID `gorm:"column:updated_by"`
	CreatedAt time.Time  `gorm:"column:created_at"`
	UpdatedAt time.Time  `gorm:"column:updated_at"`
}

func (SiteSetting) TableName() string { return "site_settings" }

// SettingsRepository reads and writes the marketplace's configuration.
type SettingsRepository struct {
	db *gorm.DB
}

func NewSettingsRepository(db *gorm.DB) *SettingsRepository {
	return &SettingsRepository{db: db}
}

// All returns every stored setting, key to raw value.
//
// Only keys that have been written are here. A key that has never been set is
// absent, and the service fills in its declared default — which is why a fresh
// database behaves exactly like a configured one that was never touched.
func (r *SettingsRepository) All(ctx context.Context) (map[string]string, error) {
	var rows []SiteSetting
	if err := r.db.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("read settings: %w", err)
	}
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		out[row.Key] = row.Value
	}
	return out, nil
}

// SettingWrite is one value to store, with the metadata that describes it.
type SettingWrite struct {
	Key       string
	Value     string
	ValueType string
	Category  string
}

// Set writes several settings in one statement, so a saved section is applied
// whole rather than half.
func (r *SettingsRepository) Set(
	ctx context.Context, writes []SettingWrite, updatedBy *uuid.UUID,
) error {
	if len(writes) == 0 {
		return nil
	}
	rows := make([]SiteSetting, 0, len(writes))
	now := time.Now()
	for _, write := range writes {
		rows = append(rows, SiteSetting{
			Key:       write.Key,
			Value:     write.Value,
			ValueType: write.ValueType,
			Category:  write.Category,
			UpdatedBy: updatedBy,
			CreatedAt: now,
			UpdatedAt: now,
		})
	}
	err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"value", "value_type", "category", "updated_by", "updated_at",
		}),
	}).Create(&rows).Error
	if err != nil {
		return fmt.Errorf("write settings: %w", err)
	}
	return nil
}

// Clear removes every stored setting.
//
// Deleting rather than writing the defaults back: the defaults live in the
// registry, and a table with no rows is exactly "nothing has been configured".
// Writing them as rows would make a fresh marketplace and a reset one differ
// for no reason, and would freeze today's defaults into the database where a
// later change to them would not reach.
func (r *SettingsRepository) Clear(ctx context.Context) (int64, error) {
	result := r.db.WithContext(ctx).Where("1 = 1").Delete(&SiteSetting{})
	if result.Error != nil {
		return 0, fmt.Errorf("clear settings: %w", result.Error)
	}
	return result.RowsAffected, nil
}

// LastUpdated is when the configuration last changed, for the page to show.
// Zero when nothing has ever been written.
func (r *SettingsRepository) LastUpdated(ctx context.Context) (time.Time, error) {
	var at *time.Time
	err := r.db.WithContext(ctx).Model(&SiteSetting{}).
		Select("max(updated_at)").Scan(&at).Error
	if err != nil {
		return time.Time{}, fmt.Errorf("settings updated at: %w", err)
	}
	if at == nil {
		return time.Time{}, nil
	}
	return *at, nil
}
