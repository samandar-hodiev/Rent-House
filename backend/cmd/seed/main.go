// Command seed inserts reference data (districts and amenities).
//
// It is safe to run repeatedly: existing rows are left alone. It creates no
// users and no apartments.
//
//	go run ./cmd/seed
package main

import (
	"github.com/samandar-hodiev/Rent-House/backend/internal/config"
	"github.com/samandar-hodiev/Rent-House/backend/internal/database"
	"github.com/samandar-hodiev/Rent-House/backend/internal/seed"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

func main() {
	if err := run(); err != nil {
		logger.Fatalf("seed: %v", err)
	}
}

func run() error {
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

	_, err = seed.Run(db)
	return err
}
