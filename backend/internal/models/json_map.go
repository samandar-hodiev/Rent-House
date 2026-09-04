package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
)

// JSONMap is a jsonb column read as a map.
//
// GORM can store a map directly, but it cannot read one back without being told
// how; these two methods are that. Kept here rather than in one model because
// more than one column will want it.
type JSONMap map[string]any

// Value renders the map for the driver. A nil map is stored as an empty object
// rather than as NULL, so a reader never has to check for both.
func (m JSONMap) Value() (driver.Value, error) {
	if m == nil {
		return []byte("{}"), nil
	}
	encoded, err := json.Marshal(m)
	if err != nil {
		return nil, fmt.Errorf("encode json column: %w", err)
	}
	return encoded, nil
}

// Scan reads the column back.
func (m *JSONMap) Scan(value any) error {
	if value == nil {
		*m = JSONMap{}
		return nil
	}

	var raw []byte
	switch typed := value.(type) {
	case []byte:
		raw = typed
	case string:
		raw = []byte(typed)
	default:
		return errors.New("json column: unsupported driver type")
	}

	decoded := JSONMap{}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return fmt.Errorf("decode json column: %w", err)
	}
	*m = decoded
	return nil
}
