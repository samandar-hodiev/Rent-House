package database

import (
	"strings"
	"testing"
)

// These read the embedded migration files and need no database.

func TestLoadMigrationsParsesEveryFile(t *testing.T) {
	migrations, err := LoadMigrations()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(migrations) == 0 {
		t.Fatal("no migrations were loaded; the embed is not picking up the .sql files")
	}

	for _, m := range migrations {
		if m.Version <= 0 {
			t.Errorf("migration %q has a non-positive version", m.Name)
		}
		if strings.TrimSpace(m.Name) == "" {
			t.Errorf("migration %04d has an empty name", m.Version)
		}
		if strings.TrimSpace(m.UpSQL) == "" {
			t.Errorf("migration %04d_%s has an empty up file", m.Version, m.Name)
		}
	}
}

func TestMigrationsAreOrderedAndUnique(t *testing.T) {
	migrations, err := LoadMigrations()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for i := 1; i < len(migrations); i++ {
		if migrations[i].Version <= migrations[i-1].Version {
			t.Fatalf("migrations are not in ascending order: %d after %d",
				migrations[i].Version, migrations[i-1].Version)
		}
	}
}

func TestEveryMigrationHasADownFile(t *testing.T) {
	migrations, err := LoadMigrations()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, m := range migrations {
		if strings.TrimSpace(m.DownSQL) == "" {
			t.Errorf("migration %04d_%s has no down file, so it cannot be rolled back", m.Version, m.Name)
		}
	}
}

func TestInitialMigrationCreatesEveryTable(t *testing.T) {
	migrations, err := LoadMigrations()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var sql string
	for _, m := range migrations {
		sql += m.UpSQL
	}

	for _, table := range []string{
		"users", "districts", "amenities", "apartments", "apartment_images",
		"apartment_amenities", "favorites", "conversations",
		"conversation_participants", "messages",
	} {
		if !strings.Contains(sql, "CREATE TABLE "+table) {
			t.Errorf("no CREATE TABLE statement for %q", table)
		}
	}
}

func TestUpMigrationsDoNotDropTables(t *testing.T) {
	// An up migration that drops a table would destroy data on deploy.
	migrations, err := LoadMigrations()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, m := range migrations {
		if strings.Contains(strings.ToUpper(m.UpSQL), "DROP TABLE") {
			t.Errorf("migration %04d_%s drops a table in its up file", m.Version, m.Name)
		}
	}
}

func TestParseMigrationNameRejectsBadNames(t *testing.T) {
	for _, name := range []string{"init", "abc_init", ""} {
		if _, _, err := parseMigrationName(name); err == nil {
			t.Errorf("expected %q to be rejected", name)
		}
	}

	version, label, err := parseMigrationName("0007_add_something")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if version != 7 || label != "add_something" {
		t.Fatalf("got (%d, %q), want (7, \"add_something\")", version, label)
	}
}
