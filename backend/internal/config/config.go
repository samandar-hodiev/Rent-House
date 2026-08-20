// Package config loads the application configuration from the environment.
//
// Nothing here carries a default for a credential or a secret: those must come
// from the environment, so a missing value fails loudly at startup instead of
// silently running on a known-weak value.
package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// defaultJWTExpiry is used when JWT_EXPIRES_IN is unset. The secret has no
// default on purpose; an expiry does, because a wrong-but-safe lifetime is
// better than refusing to start.
const defaultJWTExpiry = 24 * time.Hour

// Config holds every setting the server needs to start.
type Config struct {
	Port           string
	AllowedOrigins []string
	Database       Database
	JWT            JWT
}

// JWT holds the access-token settings.
type JWT struct {
	Secret    string
	ExpiresIn time.Duration
}

// Database holds the PostgreSQL connection settings.
type Database struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

// DSN builds the PostgreSQL connection string. It is a method rather than a
// stored field so the password is never held in a second place.
func (d Database) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		d.Host, d.Port, d.User, d.Password, d.Name, d.SSLMode,
	)
}

// Load reads .env when present, then reads the environment.
//
// A missing .env is not an error: in production the variables are supplied by
// the environment itself and no file exists.
func Load() (*Config, error) {
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		// Only report something other than "no .env here".
		if !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("read .env: %w", err)
		}
	}

	cfg := &Config{
		Port:           envOr("PORT", "8080"),
		AllowedOrigins: splitList(envOr("ALLOWED_ORIGINS", "http://localhost:5173")),
		Database: Database{
			Host:     envOr("DB_HOST", "localhost"),
			Port:     envOr("DB_PORT", "5432"),
			User:     os.Getenv("DB_USER"),
			Password: os.Getenv("DB_PASSWORD"),
			Name:     os.Getenv("DB_NAME"),
			SSLMode:  envOr("DB_SSLMODE", "disable"),
		},
		JWT: JWT{Secret: os.Getenv("JWT_SECRET")},
	}

	expiry, err := parseDuration(os.Getenv("JWT_EXPIRES_IN"), defaultJWTExpiry)
	if err != nil {
		return nil, err
	}
	cfg.JWT.ExpiresIn = expiry

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

// validate reports every missing required value at once, so a misconfigured
// deployment does not have to be fixed one restart at a time.
func (c *Config) validate() error {
	var missing []string
	for name, value := range map[string]string{
		"DB_USER":    c.Database.User,
		"DB_NAME":    c.Database.Name,
		"JWT_SECRET": c.JWT.Secret,
	} {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required environment variables: %s", strings.Join(sorted(missing), ", "))
	}
	if len(c.AllowedOrigins) == 0 {
		return errors.New("ALLOWED_ORIGINS must list at least one origin")
	}
	if c.JWT.ExpiresIn <= 0 {
		return errors.New("JWT_EXPIRES_IN must be a positive duration, for example 24h")
	}
	return nil
}

// parseDuration reads a Go duration string such as "24h" or "30m".
func parseDuration(value string, fallback time.Duration) (time.Duration, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("JWT_EXPIRES_IN %q is not a valid duration (try 24h): %w", value, err)
	}
	return parsed, nil
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func splitList(value string) []string {
	var out []string
	for _, part := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

// sorted keeps the "missing variables" message stable across runs; Go's map
// iteration order is deliberately random.
func sorted(values []string) []string {
	out := append([]string(nil), values...)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j] < out[j-1]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}
