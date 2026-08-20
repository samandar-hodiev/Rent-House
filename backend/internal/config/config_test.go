package config

import (
	"testing"
	"time"
)

func TestValidateReportsEveryMissingVariable(t *testing.T) {
	cfg := &Config{
		AllowedOrigins: []string{"http://localhost:5173"},
		JWT:            JWT{ExpiresIn: time.Hour},
		OTP:            validOTP(),
	}

	err := cfg.validate()
	if err == nil {
		t.Fatal("expected an error when required variables are unset")
	}

	want := "missing required environment variables: DB_NAME, DB_USER, JWT_SECRET"
	if err.Error() != want {
		t.Fatalf("got %q, want %q", err.Error(), want)
	}
}

func TestValidateAcceptsCompleteConfig(t *testing.T) {
	cfg := &Config{
		AllowedOrigins: []string{"http://localhost:5173"},
		Database:       Database{User: "postgres", Name: "renthouse"},
		JWT:            JWT{Secret: "secret", ExpiresIn: time.Hour},
		OTP:            validOTP(),
	}

	if err := cfg.validate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDSNIncludesEveryConnectionField(t *testing.T) {
	db := Database{
		Host: "localhost", Port: "5432", User: "postgres",
		Password: "pw", Name: "renthouse", SSLMode: "disable",
	}

	want := "host=localhost port=5432 user=postgres password=pw dbname=renthouse sslmode=disable"
	if got := db.DSN(); got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestSplitListTrimsAndDropsEmpty(t *testing.T) {
	got := splitList(" http://a.test , ,http://b.test ")

	if len(got) != 2 || got[0] != "http://a.test" || got[1] != "http://b.test" {
		t.Fatalf("got %#v, want two trimmed origins", got)
	}
}

func TestParseDurationFallsBackWhenUnset(t *testing.T) {
	got, err := parseDuration("", defaultJWTExpiry, "JWT_EXPIRES_IN")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != defaultJWTExpiry {
		t.Fatalf("got %v, want the %v default", got, defaultJWTExpiry)
	}
}

func TestParseDurationReadsAValue(t *testing.T) {
	got, err := parseDuration("30m", defaultJWTExpiry, "JWT_EXPIRES_IN")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != 30*time.Minute {
		t.Fatalf("got %v, want 30m", got)
	}
}

func TestParseDurationRejectsGarbage(t *testing.T) {
	if _, err := parseDuration("forever", defaultJWTExpiry, "JWT_EXPIRES_IN"); err == nil {
		t.Fatal("expected an error for an unparseable duration")
	}
}

func TestValidateRejectsNonPositiveExpiry(t *testing.T) {
	cfg := &Config{
		AllowedOrigins: []string{"http://localhost:5173"},
		Database:       Database{User: "postgres", Name: "renthouse"},
		JWT:            JWT{Secret: "secret", ExpiresIn: 0},
		OTP:            validOTP(),
	}
	if err := cfg.validate(); err == nil {
		t.Fatal("expected an error when the token lifetime is not positive")
	}
}

// validOTP returns a policy that passes validation, so a test can focus on the
// field it is actually exercising.
func validOTP() OTP {
	return OTP{
		Expiry:                  5 * time.Minute,
		ResendCooldown:          60 * time.Second,
		MaxAttempts:             5,
		RegistrationTokenExpiry: 15 * time.Minute,
	}
}

func TestValidateRejectsABadOTPPolicy(t *testing.T) {
	base := func() *Config {
		return &Config{
			AllowedOrigins: []string{"http://localhost:5173"},
			Database:       Database{User: "postgres", Name: "renthouse"},
			JWT:            JWT{Secret: "secret", ExpiresIn: time.Hour},
			OTP:            validOTP(),
		}
	}

	cases := map[string]func(*Config){
		"zero expiry":       func(c *Config) { c.OTP.Expiry = 0 },
		"negative cooldown": func(c *Config) { c.OTP.ResendCooldown = -time.Second },
		"zero max attempts": func(c *Config) { c.OTP.MaxAttempts = 0 },
		"zero token expiry": func(c *Config) { c.OTP.RegistrationTokenExpiry = 0 },
	}

	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			cfg := base()
			mutate(cfg)
			if err := cfg.validate(); err == nil {
				t.Fatal("expected the invalid OTP policy to be rejected")
			}
		})
	}
}

func TestParseIntReadsAValueOrFallsBack(t *testing.T) {
	if got, err := parseInt("", 5, "OTP_MAX_ATTEMPTS"); err != nil || got != 5 {
		t.Fatalf("got (%d, %v), want (5, nil)", got, err)
	}
	if got, err := parseInt("9", 5, "OTP_MAX_ATTEMPTS"); err != nil || got != 9 {
		t.Fatalf("got (%d, %v), want (9, nil)", got, err)
	}
	if _, err := parseInt("many", 5, "OTP_MAX_ATTEMPTS"); err == nil {
		t.Fatal("expected an error for a non-numeric value")
	}
}
