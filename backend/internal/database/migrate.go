package database

import (
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"

	"gorm.io/gorm"

	"github.com/samandar-hodiev/Rent-House/backend/migrations"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

// Migrations come from the embedded FS, so a built binary carries its own
// schema and does not depend on the source tree being present at run time.
var migrationFS = migrations.FS

// Migration is one versioned schema change, as a pair of SQL files.
type Migration struct {
	Version int
	Name    string
	UpSQL   string
	DownSQL string
}

// ensureMigrationsTable creates the ledger that records which versions have run.
// It is the only DDL this package issues outside a migration file.
func ensureMigrationsTable(db *gorm.DB) error {
	const stmt = `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version     integer PRIMARY KEY,
			name        text        NOT NULL,
			applied_at  timestamptz NOT NULL DEFAULT now()
		)`
	if err := db.Exec(stmt).Error; err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	return nil
}

// LoadMigrations reads the embedded SQL files, pairing each `<version>_<name>.up.sql`
// with its `.down.sql`, ordered by version.
func LoadMigrations() ([]Migration, error) {
	entries, err := fs.ReadDir(migrationFS, ".")
	if err != nil {
		return nil, fmt.Errorf("read migrations directory: %w", err)
	}

	var migrations []Migration
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".up.sql") {
			continue
		}

		base := strings.TrimSuffix(name, ".up.sql")
		version, label, err := parseMigrationName(base)
		if err != nil {
			return nil, err
		}

		upSQL, err := fs.ReadFile(migrationFS, name)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", name, err)
		}
		// A down file is optional; a migration without one simply cannot be
		// rolled back, which is preferable to inventing a reversal.
		downSQL, _ := fs.ReadFile(migrationFS, base+".down.sql")

		migrations = append(migrations, Migration{
			Version: version,
			Name:    label,
			UpSQL:   string(upSQL),
			DownSQL: string(downSQL),
		})
	}

	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].Version < migrations[j].Version
	})

	for i := 1; i < len(migrations); i++ {
		if migrations[i].Version == migrations[i-1].Version {
			return nil, fmt.Errorf("duplicate migration version %d", migrations[i].Version)
		}
	}
	return migrations, nil
}

func parseMigrationName(base string) (int, string, error) {
	prefix, label, found := strings.Cut(base, "_")
	if !found {
		return 0, "", fmt.Errorf("migration %q must be named <version>_<name>.up.sql", base)
	}
	version, err := strconv.Atoi(prefix)
	if err != nil {
		return 0, "", fmt.Errorf("migration %q has a non-numeric version: %w", base, err)
	}
	return version, label, nil
}

// AppliedVersions returns the versions already recorded in the database.
func AppliedVersions(db *gorm.DB) (map[int]bool, error) {
	if err := ensureMigrationsTable(db); err != nil {
		return nil, err
	}

	var versions []int
	if err := db.Raw("SELECT version FROM schema_migrations ORDER BY version").Scan(&versions).Error; err != nil {
		return nil, fmt.Errorf("read schema_migrations: %w", err)
	}

	applied := make(map[int]bool, len(versions))
	for _, v := range versions {
		applied[v] = true
	}
	return applied, nil
}

// MigrateUp applies every migration that has not run yet, oldest first.
//
// Each migration runs inside its own transaction together with the ledger
// insert, so a failure leaves neither a half-applied schema nor a version
// recorded for work that did not complete. Already-applied versions are
// skipped, which makes running this repeatedly safe.
func MigrateUp(db *gorm.DB) (int, error) {
	migrations, err := LoadMigrations()
	if err != nil {
		return 0, err
	}
	applied, err := AppliedVersions(db)
	if err != nil {
		return 0, err
	}

	count := 0
	for _, m := range migrations {
		if applied[m.Version] {
			logger.Infof("migration %04d_%s already applied, skipping", m.Version, m.Name)
			continue
		}

		err := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Exec(m.UpSQL).Error; err != nil {
				return fmt.Errorf("apply %04d_%s: %w", m.Version, m.Name, err)
			}
			return tx.Exec(
				"INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
				m.Version, m.Name,
			).Error
		})
		if err != nil {
			return count, err
		}

		logger.Infof("applied migration %04d_%s", m.Version, m.Name)
		count++
	}
	return count, nil
}

// MigrateDown rolls back the most recently applied migration.
//
// It is destructive, so no caller reaches it without an explicit flag, and the
// server never calls it at all.
func MigrateDown(db *gorm.DB) (int, error) {
	migrations, err := LoadMigrations()
	if err != nil {
		return 0, err
	}
	applied, err := AppliedVersions(db)
	if err != nil {
		return 0, err
	}

	for i := len(migrations) - 1; i >= 0; i-- {
		m := migrations[i]
		if !applied[m.Version] {
			continue
		}
		if strings.TrimSpace(m.DownSQL) == "" {
			return 0, fmt.Errorf("migration %04d_%s has no down file and cannot be rolled back", m.Version, m.Name)
		}

		err := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Exec(m.DownSQL).Error; err != nil {
				return fmt.Errorf("roll back %04d_%s: %w", m.Version, m.Name, err)
			}
			return tx.Exec("DELETE FROM schema_migrations WHERE version = ?", m.Version).Error
		})
		if err != nil {
			return 0, err
		}

		logger.Infof("rolled back migration %04d_%s", m.Version, m.Name)
		return m.Version, nil
	}
	return 0, nil
}
