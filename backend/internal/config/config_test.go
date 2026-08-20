package config

import (
	"testing"
	"time"
)

func TestValidateReportsEveryMissingVariable(t *testing.T) {
	cfg := &Config{AllowedOrigins: []string{"http://localhost:5173"}, JWT: JWT{ExpiresIn: time.Hour}}

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
	got, err := parseDuration("", defaultJWTExpiry)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != defaultJWTExpiry {
		t.Fatalf("got %v, want the %v default", got, defaultJWTExpiry)
	}
}

func TestParseDurationReadsAValue(t *testing.T) {
	got, err := parseDuration("30m", defaultJWTExpiry)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != 30*time.Minute {
		t.Fatalf("got %v, want 30m", got)
	}
}

func TestParseDurationRejectsGarbage(t *testing.T) {
	if _, err := parseDuration("forever", defaultJWTExpiry); err == nil {
		t.Fatal("expected an error for an unparseable duration")
	}
}

func TestValidateRejectsNonPositiveExpiry(t *testing.T) {
	cfg := &Config{
		AllowedOrigins: []string{"http://localhost:5173"},
		Database:       Database{User: "postgres", Name: "renthouse"},
		JWT:            JWT{Secret: "secret", ExpiresIn: 0},
	}
	if err := cfg.validate(); err == nil {
		t.Fatal("expected an error when the token lifetime is not positive")
	}
}
