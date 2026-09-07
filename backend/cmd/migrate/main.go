// Command migrate applies or rolls back database migrations.
//
// It is a separate binary from the server on purpose: schema changes are a
// deliberate operational step, not something that happens because a process
// restarted.
//
//	go run ./cmd/migrate up       apply every pending migration
//	go run ./cmd/migrate status   show applied and pending migrations
//	go run ./cmd/migrate down --confirm   roll back the newest migration
package main

import (
	"fmt"
	"os"

	"gorm.io/gorm"

	"github.com/samandar-hodiev/Rent-House/backend/internal/config"
	"github.com/samandar-hodiev/Rent-House/backend/internal/database"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

func main() {
	// Not the standard `flag` package: it stops parsing at the first
	// non-flag argument, so the documented `migrate down --confirm` — the
	// subcommand before the flag — would silently leave confirm unset. This
	// scans the whole argument list instead, so both orderings work.
	var command string
	var confirm bool
	for _, arg := range os.Args[1:] {
		switch arg {
		case "--confirm", "-confirm":
			confirm = true
		default:
			if command == "" {
				command = arg
			}
		}
	}
	if command == "" {
		command = "up"
	}

	if err := run(command, confirm); err != nil {
		logger.Fatalf("migrate: %v", err)
	}
}

func run(command string, confirm bool) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	db, err := database.Connect(cfg.Database)
	if err != nil {
		return err
	}
	defer func() {
		if err := database.Close(db); err != nil {
			logger.Errorf("closing database: %v", err)
		}
	}()

	switch command {
	case "up":
		applied, err := database.MigrateUp(db)
		if err != nil {
			return err
		}
		if applied == 0 {
			logger.Infof("schema is already up to date")
		} else {
			logger.Infof("applied %d migration(s)", applied)
		}
		return nil

	case "status":
		return printStatus(db)

	case "down":
		if !confirm {
			return fmt.Errorf("down drops tables; re-run with --confirm if that is what you want")
		}
		version, err := database.MigrateDown(db)
		if err != nil {
			return err
		}
		if version == 0 {
			logger.Infof("nothing to roll back")
		}
		return nil

	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\nusage: migrate [up|down|status]\n", command)
		os.Exit(2)
		return nil
	}
}

// printStatus lists every migration and whether it has run.
func printStatus(db *gorm.DB) error {
	migrations, err := database.LoadMigrations()
	if err != nil {
		return err
	}
	applied, err := database.AppliedVersions(db)
	if err != nil {
		return err
	}

	for _, m := range migrations {
		state := "pending"
		if applied[m.Version] {
			state = "applied"
		}
		fmt.Printf("%04d_%-20s %s\n", m.Version, m.Name, state)
	}
	return nil
}
