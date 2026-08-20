package notify

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// These exercise the providers against a local stand-in for the real API. They
// prove the request we build is the request the provider documents, and — more
// importantly — that a rejection surfaces as an error rather than being
// swallowed into a false "code sent".
//
// They do not prove a message is delivered. Only real credentials can, and none
// exist in this repository.

// ---------- Resend ----------

func TestResendSendsTheDocumentedRequest(t *testing.T) {
	var (
		gotAuth   string
		gotType   string
		gotMethod string
		body      map[string]any
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotType = r.Header.Get("Content-Type")
		gotMethod = r.Method
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"msg_123"}`))
	}))
	defer server.Close()

	sender, err := NewResendSender(ResendConfig{
		APIKey: "re_test_key", From: "RentHouse <no-reply@renthouse.uz>",
		Subject: "RentHouse tasdiqlash kodi", BodyFormat: "Kodingiz: {code}",
		BaseURL: server.URL,
	})
	if err != nil {
		t.Fatalf("build sender: %v", err)
	}

	if err := sender.Send(context.Background(), "user@example.test", "483921"); err != nil {
		t.Fatalf("send: %v", err)
	}

	if gotMethod != http.MethodPost {
		t.Errorf("got method %s, want POST", gotMethod)
	}
	if gotAuth != "Bearer re_test_key" {
		t.Errorf("got auth %q, want a bearer token", gotAuth)
	}
	if gotType != "application/json" {
		t.Errorf("got content-type %q, want application/json", gotType)
	}
	if body["from"] != "RentHouse <no-reply@renthouse.uz>" {
		t.Errorf("got from %v", body["from"])
	}
	to, _ := body["to"].([]any)
	if len(to) != 1 || to[0] != "user@example.test" {
		t.Errorf("got to %v, want the destination address", body["to"])
	}
	if body["text"] != "Kodingiz: 483921" {
		t.Errorf("got text %q, want the code substituted", body["text"])
	}
}

func TestResendReportsAFailureInsteadOfSwallowingIt(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		// What an unverified sending domain looks like.
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"message":"The renthouse.uz domain is not verified"}`))
	}))
	defer server.Close()

	sender, _ := NewResendSender(ResendConfig{
		APIKey: "re_test_key", From: "no-reply@renthouse.uz",
		Subject: "s", BodyFormat: "{code}", BaseURL: server.URL,
	})

	err := sender.Send(context.Background(), "user@example.test", "483921")
	if err == nil {
		t.Fatal("a rejected send must return an error, never a silent success")
	}
	if !strings.Contains(err.Error(), "403") {
		t.Errorf("error %q should carry the provider's status", err)
	}
}

func TestResendErrorDoesNotLeakTheCode(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"message":"bad request"}`))
	}))
	defer server.Close()

	sender, _ := NewResendSender(ResendConfig{
		APIKey: "k", From: "a@b.test", Subject: "s", BodyFormat: "{code}", BaseURL: server.URL,
	})

	err := sender.Send(context.Background(), "user@example.test", "483921")
	if err != nil && strings.Contains(err.Error(), "483921") {
		t.Fatalf("the error leaked the verification code: %v", err)
	}
}

func TestResendRequiresConfiguration(t *testing.T) {
	if _, err := NewResendSender(ResendConfig{From: "a@b.test"}); err == nil {
		t.Error("a missing API key must be rejected")
	}
	if _, err := NewResendSender(ResendConfig{APIKey: "k"}); err == nil {
		t.Error("a missing sender address must be rejected")
	}
}

// ---------- Eskiz ----------

func newEskizServer(t *testing.T, onSend func(w http.ResponseWriter, r *http.Request)) (*httptest.Server, *int) {
	t.Helper()
	logins := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/auth/login":
			logins++
			_ = r.ParseMultipartForm(1 << 20)
			if r.FormValue("email") == "" || r.FormValue("password") == "" {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"data":{"token":"token-` + r.FormValue("email") + `"}}`))
		case "/message/sms/send":
			onSend(w, r)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	return server, &logins
}

func TestEskizLogsInThenSends(t *testing.T) {
	var gotAuth, gotPhone, gotMessage, gotFrom string

	server, logins := newEskizServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		_ = r.ParseMultipartForm(1 << 20)
		gotPhone = r.FormValue("mobile_phone")
		gotMessage = r.FormValue("message")
		gotFrom = r.FormValue("from")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"waiting"}`))
	})
	defer server.Close()

	sender, err := NewEskizSender(EskizConfig{
		Email: "api@renthouse.uz", Password: "secret", From: "4546",
		MessageFormat: "RentHouse tasdiqlash kodi: {code}", BaseURL: server.URL,
	})
	if err != nil {
		t.Fatalf("build sender: %v", err)
	}

	if err := sender.Send(context.Background(), "+998901234567", "483921"); err != nil {
		t.Fatalf("send: %v", err)
	}

	if *logins != 1 {
		t.Errorf("got %d logins, want exactly 1", *logins)
	}
	if gotAuth != "Bearer token-api@renthouse.uz" {
		t.Errorf("got auth %q, want the token from login", gotAuth)
	}
	// Eskiz expects the number without a leading plus.
	if gotPhone != "998901234567" {
		t.Errorf("got phone %q, want it without the plus", gotPhone)
	}
	if gotMessage != "RentHouse tasdiqlash kodi: 483921" {
		t.Errorf("got message %q, want the code substituted", gotMessage)
	}
	if gotFrom != "4546" {
		t.Errorf("got from %q, want the configured sender id", gotFrom)
	}
}

func TestEskizReusesItsToken(t *testing.T) {
	server, logins := newEskizServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	defer server.Close()

	sender, _ := NewEskizSender(EskizConfig{
		Email: "a@b.test", Password: "p", From: "4546",
		MessageFormat: "{code}", BaseURL: server.URL,
	})

	for i := 0; i < 3; i++ {
		if err := sender.Send(context.Background(), "+998901234567", "111111"); err != nil {
			t.Fatalf("send %d: %v", i, err)
		}
	}

	if *logins != 1 {
		t.Fatalf("logged in %d times for 3 sends; the token is not being cached", *logins)
	}
}

func TestEskizRefreshesARejectedToken(t *testing.T) {
	calls := 0
	server, logins := newEskizServer(t, func(w http.ResponseWriter, _ *http.Request) {
		calls++
		// An expired token on the first attempt, accepted after re-login.
		if calls == 1 {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	defer server.Close()

	sender, _ := NewEskizSender(EskizConfig{
		Email: "a@b.test", Password: "p", From: "4546",
		MessageFormat: "{code}", BaseURL: server.URL,
	})

	if err := sender.Send(context.Background(), "+998901234567", "483921"); err != nil {
		t.Fatalf("send: %v", err)
	}
	if *logins != 2 {
		t.Errorf("got %d logins, want 2 — one initial, one after the rejection", *logins)
	}
	if calls != 2 {
		t.Errorf("got %d send attempts, want 2", calls)
	}
}

func TestEskizReportsAFailedSend(t *testing.T) {
	server, _ := newEskizServer(t, func(w http.ResponseWriter, _ *http.Request) {
		// What an unapproved message template looks like.
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"message":"message text is not allowed"}`))
	})
	defer server.Close()

	sender, _ := NewEskizSender(EskizConfig{
		Email: "a@b.test", Password: "p", From: "4546",
		MessageFormat: "{code}", BaseURL: server.URL,
	})

	err := sender.Send(context.Background(), "+998901234567", "483921")
	if err == nil {
		t.Fatal("a rejected send must return an error, never a silent success")
	}
	if strings.Contains(err.Error(), "483921") {
		t.Fatalf("the error leaked the verification code: %v", err)
	}
}

func TestEskizReportsAFailedLogin(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"invalid credentials"}`))
	}))
	defer server.Close()

	sender, _ := NewEskizSender(EskizConfig{
		Email: "a@b.test", Password: "wrong", From: "4546",
		MessageFormat: "{code}", BaseURL: server.URL,
	})

	err := sender.Send(context.Background(), "+998901234567", "483921")
	if err == nil {
		t.Fatal("a failed login must return an error")
	}
	if strings.Contains(err.Error(), "wrong") {
		t.Fatalf("the error leaked the password: %v", err)
	}
}

func TestEskizRequiresConfiguration(t *testing.T) {
	cases := map[string]EskizConfig{
		"no email":    {Password: "p", From: "4546"},
		"no password": {Email: "a@b.test", From: "4546"},
		"no sender":   {Email: "a@b.test", Password: "p"},
	}
	for name, cfg := range cases {
		if _, err := NewEskizSender(cfg); err == nil {
			t.Errorf("%s: expected the configuration to be rejected", name)
		}
	}
}

func TestNormalizePhoneStripsThePlus(t *testing.T) {
	cases := map[string]string{
		"+998901234567":   "998901234567",
		"998901234567":    "998901234567",
		" +998901234567 ": "998901234567",
	}
	for input, want := range cases {
		if got := normalizePhone(input); got != want {
			t.Errorf("normalizePhone(%q) = %q, want %q", input, got, want)
		}
	}
}

// ---------- factory ----------

func TestFactoryDefaultsToTheDevelopmentSenders(t *testing.T) {
	email, err := BuildEmailSender(Settings{})
	if err != nil {
		t.Fatalf("email: %v", err)
	}
	if _, ok := email.(DevelopmentEmailSender); !ok {
		t.Errorf("got %T, want the development email sender", email)
	}

	sms, err := BuildSMSSender(Settings{})
	if err != nil {
		t.Fatalf("sms: %v", err)
	}
	if _, ok := sms.(DevelopmentSMSSender); !ok {
		t.Errorf("got %T, want the development sms sender", sms)
	}
}

func TestFactoryBuildsTheRealProviders(t *testing.T) {
	email, err := BuildEmailSender(Settings{
		EmailProvider: ProviderResend,
		Resend:        ResendConfig{APIKey: "k", From: "a@b.test"},
	})
	if err != nil {
		t.Fatalf("email: %v", err)
	}
	if _, ok := email.(*ResendSender); !ok {
		t.Errorf("got %T, want the Resend sender", email)
	}

	sms, err := BuildSMSSender(Settings{
		SMSProvider: ProviderEskiz,
		Eskiz:       EskizConfig{Email: "a@b.test", Password: "p", From: "4546"},
	})
	if err != nil {
		t.Fatalf("sms: %v", err)
	}
	if _, ok := sms.(*EskizSender); !ok {
		t.Errorf("got %T, want the Eskiz sender", sms)
	}
}

func TestFactoryRefusesAMisconfiguredRealProvider(t *testing.T) {
	// The important case: selecting a real provider without credentials must
	// fail, not quietly fall back to logging codes.
	if _, err := BuildEmailSender(Settings{EmailProvider: ProviderResend}); err == nil {
		t.Error("resend without credentials must not fall back to the dev sender")
	}
	if _, err := BuildSMSSender(Settings{SMSProvider: ProviderEskiz}); err == nil {
		t.Error("eskiz without credentials must not fall back to the dev sender")
	}
}

func TestFactoryRejectsAnUnknownProvider(t *testing.T) {
	if _, err := BuildEmailSender(Settings{EmailProvider: "mailgun"}); err == nil {
		t.Error("an unknown email provider must be rejected")
	}
	if _, err := BuildSMSSender(Settings{SMSProvider: "twilio"}); err == nil {
		t.Error("an unknown sms provider must be rejected")
	}
}

func TestIsDevelopment(t *testing.T) {
	for _, name := range []string{"", "dev", "DEV", " dev "} {
		if !IsDevelopment(name) {
			t.Errorf("IsDevelopment(%q) = false, want true", name)
		}
	}
	for _, name := range []string{"resend", "eskiz"} {
		if IsDevelopment(name) {
			t.Errorf("IsDevelopment(%q) = true, want false", name)
		}
	}
}
