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
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// defaultJWTExpiry is used when JWT_EXPIRES_IN is unset. The secret has no
// default on purpose; an expiry does, because a wrong-but-safe lifetime is
// better than refusing to start.
const (
	defaultJWTExpiry = 24 * time.Hour

	defaultOTPExpiry         = 5 * time.Minute
	defaultOTPResendCooldown = 60 * time.Second
	defaultOTPMaxAttempts    = 5
	// A verified code buys a short window to finish the profile form. Long
	// enough to type a name and a password, short enough that a stolen token is
	// nearly worthless.
	defaultRegistrationTokenExpiry = 15 * time.Minute
)

// Config holds every setting the server needs to start.
type Config struct {
	Port           string
	AllowedOrigins []string
	Database       Database
	JWT            JWT
	OTP            OTP
	Notify         Notify
}

// Notify selects how verification codes are delivered.
type Notify struct {
	EmailProvider string
	SMSProvider   string

	ResendAPIKey  string
	ResendFrom    string
	ResendSubject string
	ResendBody    string

	EskizEmail    string
	EskizPassword string
	EskizFrom     string
	EskizMessage  string
}

// OTP holds the one-time-code policy.
type OTP struct {
	Expiry                  time.Duration
	ResendCooldown          time.Duration
	MaxAttempts             int
	RegistrationTokenExpiry time.Duration
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

	// JWT_EXPIRES_IN is the documented name; JWT_EXPIRATION is accepted as an
	// alias so either spelling works.
	jwtExpiry, err := parseDuration(firstSet("JWT_EXPIRES_IN", "JWT_EXPIRATION"), defaultJWTExpiry, "JWT_EXPIRES_IN")
	if err != nil {
		return nil, err
	}
	cfg.JWT.ExpiresIn = jwtExpiry

	otpExpiry, err := parseDuration(os.Getenv("OTP_EXPIRATION"), defaultOTPExpiry, "OTP_EXPIRATION")
	if err != nil {
		return nil, err
	}
	cooldown, err := parseDuration(os.Getenv("OTP_RESEND_COOLDOWN"), defaultOTPResendCooldown, "OTP_RESEND_COOLDOWN")
	if err != nil {
		return nil, err
	}
	maxAttempts, err := parseInt(os.Getenv("OTP_MAX_ATTEMPTS"), defaultOTPMaxAttempts, "OTP_MAX_ATTEMPTS")
	if err != nil {
		return nil, err
	}
	tokenExpiry, err := parseDuration(
		os.Getenv("REGISTRATION_TOKEN_EXPIRATION"), defaultRegistrationTokenExpiry, "REGISTRATION_TOKEN_EXPIRATION")
	if err != nil {
		return nil, err
	}
	cfg.OTP = OTP{
		Expiry:                  otpExpiry,
		ResendCooldown:          cooldown,
		MaxAttempts:             maxAttempts,
		RegistrationTokenExpiry: tokenExpiry,
	}

	cfg.Notify = Notify{
		EmailProvider: strings.ToLower(envOr("EMAIL_PROVIDER", "dev")),
		SMSProvider:   strings.ToLower(envOr("SMS_PROVIDER", "dev")),

		ResendAPIKey:  os.Getenv("RESEND_API_KEY"),
		ResendFrom:    os.Getenv("RESEND_FROM"),
		ResendSubject: envOr("RESEND_SUBJECT", "RentHouse tasdiqlash kodi"),
		// {code} is substituted at send time.
		ResendBody: envOr("RESEND_BODY",
			"RentHouse tasdiqlash kodingiz: {code}\n\nKod 5 daqiqa amal qiladi."),

		EskizEmail:    os.Getenv("ESKIZ_EMAIL"),
		EskizPassword: os.Getenv("ESKIZ_PASSWORD"),
		EskizFrom:     envOr("ESKIZ_FROM", "4546"),
		// Must match the template approved by Eskiz moderation.
		EskizMessage: envOr("ESKIZ_MESSAGE", "RentHouse tasdiqlash kodi: {code}"),
	}

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
	if c.OTP.Expiry <= 0 {
		return errors.New("OTP_EXPIRATION must be a positive duration, for example 5m")
	}
	if c.OTP.ResendCooldown < 0 {
		return errors.New("OTP_RESEND_COOLDOWN must not be negative")
	}
	if c.OTP.MaxAttempts <= 0 {
		return errors.New("OTP_MAX_ATTEMPTS must be at least 1")
	}
	if c.OTP.RegistrationTokenExpiry <= 0 {
		return errors.New("REGISTRATION_TOKEN_EXPIRATION must be a positive duration, for example 15m")
	}
	return c.validateNotify()
}

// validateNotify checks that a selected real provider has its credentials.
//
// Missing credentials are a startup failure rather than a fallback to the
// development sender: a server that believes it is sending codes while only
// writing them to its own log would leave every registration stuck.
func (c *Config) validateNotify() error {
	var missing []string

	switch c.Notify.EmailProvider {
	case "", "dev":
	case "resend":
		if strings.TrimSpace(c.Notify.ResendAPIKey) == "" {
			missing = append(missing, "RESEND_API_KEY")
		}
		if strings.TrimSpace(c.Notify.ResendFrom) == "" {
			missing = append(missing, "RESEND_FROM")
		}
	default:
		return fmt.Errorf("EMAIL_PROVIDER %q is not supported (expected dev or resend)", c.Notify.EmailProvider)
	}

	switch c.Notify.SMSProvider {
	case "", "dev":
	case "eskiz":
		if strings.TrimSpace(c.Notify.EskizEmail) == "" {
			missing = append(missing, "ESKIZ_EMAIL")
		}
		if strings.TrimSpace(c.Notify.EskizPassword) == "" {
			missing = append(missing, "ESKIZ_PASSWORD")
		}
	default:
		return fmt.Errorf("SMS_PROVIDER %q is not supported (expected dev or eskiz)", c.Notify.SMSProvider)
	}

	if len(missing) > 0 {
		return fmt.Errorf("missing required environment variables: %s", strings.Join(sorted(missing), ", "))
	}
	return nil
}

// firstSet returns the value of the first environment variable that is set,
// so a setting can be renamed without breaking existing deployments.
func firstSet(names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}

func parseInt(value string, fallback int, name string) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s %q is not a valid whole number: %w", name, value, err)
	}
	return parsed, nil
}

// parseDuration reads a Go duration string such as "24h" or "5m".
func parseDuration(value string, fallback time.Duration, name string) (time.Duration, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("%s %q is not a valid duration (try 24h or 5m): %w", name, value, err)
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
