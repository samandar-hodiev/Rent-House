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
		upper := strings.ToUpper(m.UpSQL)
		// A temporary table is scratch space the migration created for itself
		// and must clean up; it holds no data anyone deployed. Only permanent
		// tables are what this guard is about.
		temporary := map[string]bool{}
		for _, line := range strings.Split(upper, "\n") {
			if rest, found := strings.CutPrefix(strings.TrimSpace(line), "CREATE TEMP TABLE "); found {
				temporary[strings.Fields(rest)[0]] = true
			}
		}

		for _, line := range strings.Split(upper, "\n") {
			rest, found := strings.CutPrefix(strings.TrimSpace(line), "DROP TABLE ")
			if !found {
				continue
			}
			rest = strings.TrimPrefix(rest, "IF EXISTS ")
			name := strings.TrimRight(strings.Fields(rest)[0], ";")
			if !temporary[name] {
				t.Errorf("migration %04d_%s drops table %q in its up file",
					m.Version, m.Name, name)
			}
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
