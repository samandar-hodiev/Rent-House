// Package database opens and owns the PostgreSQL connection.
package database

import (
	"fmt"
	"log"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/samandar-hodiev/Rent-House/backend/internal/config"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

const (
	maxOpenConns    = 25
	maxIdleConns    = 5
	connMaxLifetime = time.Hour

	slowQueryThreshold = 300 * time.Millisecond
)

// newGormLogger configures GORM's logging.
//
// ParameterizedQueries is the important setting: without it GORM writes bound
// values into the log whenever a statement is slow or fails, which would put
// password hashes — and later, personal data — into plain text log files. With
// it, the statement is logged as `$1, $2` and the values stay out.
func newGormLogger() gormlogger.Interface {
	return gormlogger.New(
		log.New(os.Stdout, "SQL   ", log.LstdFlags|log.Lmsgprefix),
		gormlogger.Config{
			SlowThreshold:             slowQueryThreshold,
			LogLevel:                  gormlogger.Warn,
			IgnoreRecordNotFoundError: true,
			ParameterizedQueries:      true,
			Colorful:                  false,
		},
	)
}

// Connect opens a PostgreSQL connection and verifies it with a ping.
//
// gorm.Open is lazy — it does not necessarily talk to the server — so the ping
// is what turns "wrong host or credentials" into a startup failure instead of a
// surprise on the first query.
//
// No models are registered and AutoMigrate is deliberately not called: schema
// management arrives with the first entity.
func Connect(cfg config.Database) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger: newGormLogger(),
	})
	if err != nil {
		return nil, fmt.Errorf("open postgres connection: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("access underlying sql.DB: %w", err)
	}

	sqlDB.SetMaxOpenConns(maxOpenConns)
	sqlDB.SetMaxIdleConns(maxIdleConns)
	sqlDB.SetConnMaxLifetime(connMaxLifetime)

	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("ping postgres at %s:%s/%s: %w", cfg.Host, cfg.Port, cfg.Name, err)
	}

	logger.Infof("connected to postgres at %s:%s/%s", cfg.Host, cfg.Port, cfg.Name)
	return db, nil
}

// Close releases the connection pool. Errors are returned rather than logged so
// the caller decides how a shutdown failure is reported.
func Close(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("access underlying sql.DB: %w", err)
	}
	return sqlDB.Close()
}
