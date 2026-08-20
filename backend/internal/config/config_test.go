package config

import "testing"

func TestValidateReportsEveryMissingVariable(t *testing.T) {
	cfg := &Config{AllowedOrigins: []string{"http://localhost:5173"}}

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
		JWTSecret:      "secret",
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
