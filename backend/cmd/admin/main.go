// Command admin creates the first owner account.
//
// The owner is the account with the highest privilege in the system, so there
// is deliberately no endpoint that creates it: an HTTP route that mints an
// owner is a door that only has to be left open once. It is created here, by
// somebody with shell access to the server, and only when no owner exists yet.
//
// Safe to run repeatedly — with an owner present it changes nothing and says
// so.
//
//	ADMIN_OWNER_NAME="Samandar Hodiev" \
//	ADMIN_OWNER_EMAIL=admin@renthouse.uz \
//	ADMIN_OWNER_PASSWORD='…' \
//	go run ./cmd/admin
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/samandar-hodiev/Rent-House/backend/internal/config"
	"github.com/samandar-hodiev/Rent-House/backend/internal/database"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/internal/token"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

// The same minimum the API enforces, so an account created here cannot be
// weaker than one created through the dashboard.
const minPasswordLength = 8

func main() {
	if err := run(); err != nil {
		logger.Fatalf("admin: %v", err)
	}
}

func run() error {
	name := strings.TrimSpace(os.Getenv("ADMIN_OWNER_NAME"))
	email := strings.TrimSpace(os.Getenv("ADMIN_OWNER_EMAIL"))
	password := os.Getenv("ADMIN_OWNER_PASSWORD")

	// Checked before the database is touched, so a missing variable fails
	// immediately and says which one.
	switch {
	case name == "":
		return errors.New("ADMIN_OWNER_NAME is required")
	case email == "":
		return errors.New("ADMIN_OWNER_EMAIL is required")
	case len(password) < minPasswordLength:
		return fmt.Errorf("ADMIN_OWNER_PASSWORD must be at least %d characters", minPasswordLength)
	}

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

	// The token service is a dependency of AdminService but is not used by
	// EnsureOwner; a short expiry is enough to satisfy its constructor.
	tokens, err := token.New(cfg.JWT.Secret, cfg.JWT.ExpiresIn)
	if err != nil {
		return err
	}

	// No settings service: this command creates the first owner, before there
	// is anybody to have configured a password policy. The built-in minimum
	// applies, which is what EnsureOwner already checks against.
	admins := service.NewAdminService(repository.NewAdminRepository(db), tokens, nil, nil, nil)
	created, err := admins.EnsureOwner(context.Background(), name, email, password)
	if err != nil {
		return err
	}

	if created {
		logger.Infof("owner account created for %s", email)
	} else {
		logger.Infof("an owner already exists; nothing to do")
	}
	return nil
}
