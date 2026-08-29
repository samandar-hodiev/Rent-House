package repository

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SiteSetting is one configured value.
type SiteSetting struct {
	Key       string    `gorm:"column:key;primaryKey"`
	Value     string    `gorm:"column:value"`
	UpdatedAt time.Time `gorm:"column:updated_at"`
}

func (SiteSetting) TableName() string { return "site_settings" }

// SettingsRepository reads and writes the marketplace's configuration.
type SettingsRepository struct {
	db *gorm.DB
}

func NewSettingsRepository(db *gorm.DB) *SettingsRepository {
	return &SettingsRepository{db: db}
}

// All returns every setting, key to raw value.
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

// Set writes several settings at once, so a saved form is applied whole rather
// than half.
func (r *SettingsRepository) Set(ctx context.Context, values map[string]string) error {
	if len(values) == 0 {
		return nil
	}
	rows := make([]SiteSetting, 0, len(values))
	now := time.Now()
	for key, value := range values {
		rows = append(rows, SiteSetting{Key: key, Value: value, UpdatedAt: now})
	}
	err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&rows).Error
	if err != nil {
		return fmt.Errorf("write settings: %w", err)
	}
	return nil
}
