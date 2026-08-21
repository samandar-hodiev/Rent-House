package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
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

// ---------- Resend: template and failure modes ----------

func TestResendEmailContainsTheCodeAndNothingSensitive(t *testing.T) {
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sender, _ := NewResendSender(ResendConfig{
		APIKey: "k", From: "RentHouse <no-reply@example.test>", BaseURL: server.URL,
	})
	if err := sender.Send(context.Background(), "user@example.test", "483921"); err != nil {
		t.Fatalf("send: %v", err)
	}

	subject, _ := body["subject"].(string)
	if subject != defaultEmailSubject {
		t.Errorf("got subject %q, want %q", subject, defaultEmailSubject)
	}

	text, _ := body["text"].(string)
	htmlBody, _ := body["html"].(string)

	for _, part := range []string{text, htmlBody} {
		if !strings.Contains(part, "483921") {
			t.Errorf("the message does not contain the code: %q", part)
		}
		if !strings.Contains(part, "RentHouse") {
			t.Errorf("the message does not identify RentHouse: %q", part)
		}
		if !strings.Contains(part, "5 daqiqa") {
			t.Errorf("the message does not state the validity window: %q", part)
		}
	}

	// Nothing beyond the code may travel in the email.
	for _, forbidden := range []string{"password", "Parol", "jwt", "token", "registration_token", "api_key"} {
		if strings.Contains(strings.ToLower(text+htmlBody), strings.ToLower(forbidden)) {
			t.Errorf("the email contains %q, which must never be sent", forbidden)
		}
	}
}

func TestResendSendsBothTextAndHTML(t *testing.T) {
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sender, _ := NewResendSender(ResendConfig{APIKey: "k", From: "a@b.test", BaseURL: server.URL})
	_ = sender.Send(context.Background(), "user@example.test", "111111")

	if text, _ := body["text"].(string); strings.TrimSpace(text) == "" {
		t.Error("no plain-text part; clients without HTML would see an empty message")
	}
	if htmlBody, _ := body["html"].(string); !strings.Contains(htmlBody, "<html") {
		t.Error("no HTML part")
	}
}

func TestResendCustomSubjectAndBodyWin(t *testing.T) {
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	sender, _ := NewResendSender(ResendConfig{
		APIKey: "k", From: "a@b.test", BaseURL: server.URL,
		Subject: "Custom subject", BodyFormat: "Code is {code}",
	})
	_ = sender.Send(context.Background(), "user@example.test", "222222")

	if body["subject"] != "Custom subject" {
		t.Errorf("got subject %v, want the configured one", body["subject"])
	}
	if text, _ := body["text"].(string); text != "Code is 222222" {
		t.Errorf("got text %q, want the configured body", text)
	}
}

func TestResendReportsANetworkFailure(t *testing.T) {
	// A server that is closed before the request: the DNS/connection failure
	// path, which must be an error and not a silent success.
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := server.URL
	server.Close()

	sender, _ := NewResendSender(ResendConfig{APIKey: "k", From: "a@b.test", BaseURL: url})

	err := sender.Send(context.Background(), "user@example.test", "483921")
	if err == nil {
		t.Fatal("an unreachable provider must return an error")
	}
	if strings.Contains(err.Error(), "483921") {
		t.Fatalf("the error leaked the code: %v", err)
	}
}

func TestResendRespectsAContextDeadline(t *testing.T) {
	// A provider that never answers must not hang the registration request.
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		<-release
	}))
	defer func() { close(release); server.Close() }()

	sender, _ := NewResendSender(ResendConfig{APIKey: "k", From: "a@b.test", BaseURL: server.URL})

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	start := time.Now()
	err := sender.Send(ctx, "user@example.test", "483921")
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("a timed-out send must return an error")
	}
	if elapsed > 3*time.Second {
		t.Fatalf("send took %v; the context deadline was not honoured", elapsed)
	}
}

func TestResendHasADefaultTimeout(t *testing.T) {
	// Even without a caller deadline the client must not wait forever.
	sender, err := NewResendSender(ResendConfig{APIKey: "k", From: "a@b.test"})
	if err != nil {
		t.Fatalf("build sender: %v", err)
	}
	if sender.client.Timeout <= 0 {
		t.Fatal("the HTTP client has no timeout; a hung provider would hang the request")
	}
}

func TestResendAcceptsAMalformedSuccessBody(t *testing.T) {
	// Resend accepted the message; the body being unreadable is not a delivery
	// failure and must not be reported as one.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{not json at all`))
	}))
	defer server.Close()

	sender, _ := NewResendSender(ResendConfig{APIKey: "k", From: "a@b.test", BaseURL: server.URL})

	if err := sender.Send(context.Background(), "user@example.test", "483921"); err != nil {
		t.Fatalf("a 2xx with an odd body is still an accepted send: %v", err)
	}
}

func TestResendRejectsAMalformedErrorBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`<html>gateway error</html>`))
	}))
	defer server.Close()

	sender, _ := NewResendSender(ResendConfig{APIKey: "k", From: "a@b.test", BaseURL: server.URL})

	err := sender.Send(context.Background(), "user@example.test", "483921")
	if err == nil {
		t.Fatal("a 502 must be an error even when the body is not JSON")
	}
}

func TestDescribeStatusPointsAtTheLikelyCause(t *testing.T) {
	if got := describeStatus(401, "unauthorized"); !strings.Contains(got, "RESEND_API_KEY") {
		t.Errorf("a 401 should mention the API key: %q", got)
	}
	if got := describeStatus(403, "domain not verified"); !strings.Contains(got, "RESEND_FROM") {
		t.Errorf("a 403 should mention the sender domain: %q", got)
	}
	if got := describeStatus(500, "boom"); !strings.Contains(got, "Resend is failing") {
		t.Errorf("a 5xx should point at the provider: %q", got)
	}
}

// The bug this guards against: every registration arriving at one inbox
// regardless of what the user typed. The sender must forward the address it was
// handed, verbatim, every time — with no shared state between calls and no
// fallback recipient of any kind.
func TestResendSendsToEachRequestedRecipientAndNoOther(t *testing.T) {
	var recipients [][]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		to, _ := body["to"].([]any)
		recipients = append(recipients, to)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"msg_x"}`))
	}))
	defer server.Close()

	sender, err := NewResendSender(ResendConfig{
		APIKey: "re_test_key", From: "RentHouse <no-reply@renthouse.uz>",
		BaseURL: server.URL,
	})
	if err != nil {
		t.Fatalf("build sender: %v", err)
	}

	// Two addresses that differ only in the local part, which is exactly the
	// case a redirect-to-owner bug would collapse.
	wanted := []string{"alice@example.test", "bob@example.test"}
	for _, address := range wanted {
		if err := sender.Send(context.Background(), address, "111111"); err != nil {
			t.Fatalf("send to %s: %v", address, err)
		}
	}

	if len(recipients) != len(wanted) {
		t.Fatalf("got %d requests, want %d", len(recipients), len(wanted))
	}
	for i, address := range wanted {
		if len(recipients[i]) != 1 {
			t.Fatalf("request %d addressed %d recipients, want exactly 1", i, len(recipients[i]))
		}
		if recipients[i][0] != address {
			t.Errorf("request %d went to %v, want %s", i, recipients[i][0], address)
		}
	}
	// Stated separately so a failure says "they collapsed onto one inbox"
	// rather than only "recipient 1 was wrong".
	if recipients[0][0] == recipients[1][0] {
		t.Errorf("both messages went to %v — recipients are being collapsed", recipients[0][0])
	}
}

// A rejection must surface as an error. Returning nil here is what would let the
// API answer "code sent" for a message the provider refused.
func TestResendRejectionForAnUnverifiedDomainIsAnError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		// Resend's real wording when the account is still in test mode.
		_, _ = w.Write([]byte(`{"statusCode":403,"name":"validation_error",` +
			`"message":"You can only send testing emails to your own email address"}`))
	}))
	defer server.Close()

	sender, err := NewResendSender(ResendConfig{
		APIKey: "re_test_key", From: "RentHouse <onboarding@resend.dev>",
		BaseURL: server.URL,
	})
	if err != nil {
		t.Fatalf("build sender: %v", err)
	}

	err = sender.Send(context.Background(), "someone-else@example.test", "483921")
	if err == nil {
		t.Fatal("a rejected send reported success")
	}
	if strings.Contains(err.Error(), "483921") {
		t.Error("the error carries the verification code")
	}
	if strings.Contains(err.Error(), "re_test_key") {
		t.Error("the error carries the API key")
	}
}

// The accepted-path log has to be traceable without being a leak: it carries the
// provider's message id, and never the code or the key.
func TestResendAcceptedSendIsLoggedWithItsMessageIDAndNoSecrets(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"819a5454-c69c-47fc-a3d3-c7678f13ace6"}`))
	}))
	defer server.Close()

	sender, err := NewResendSender(ResendConfig{
		APIKey: "re_super_secret", From: "RentHouse <no-reply@renthouse.uz>",
		BaseURL: server.URL,
	})
	if err != nil {
		t.Fatalf("build sender: %v", err)
	}

	var buf bytes.Buffer
	restore := logger.SwapOutput(&buf)
	defer restore()

	if err := sender.Send(context.Background(), "alice@example.test", "483921"); err != nil {
		t.Fatalf("send: %v", err)
	}

	out := buf.String()
	for _, want := range []string{"provider=resend", "status=accepted", "819a5454-c69c-47fc-a3d3-c7678f13ace6"} {
		if !strings.Contains(out, want) {
			t.Errorf("log is missing %q; got %q", want, out)
		}
	}
	for _, leak := range []string{"483921", "re_super_secret", "alice@example.test"} {
		if strings.Contains(out, leak) {
			t.Errorf("log leaked %q; got %q", leak, out)
		}
	}
	// Masked, but still distinguishable from a different recipient.
	if !strings.Contains(out, "a***@example.test") {
		t.Errorf("log does not identify the recipient at all; got %q", out)
	}
}
