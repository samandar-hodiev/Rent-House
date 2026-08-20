package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"sync"
	"time"
)

// eskizBaseURL is Eskiz's notification API. Overridable so tests can point at a
// local server.
const eskizBaseURL = "https://notify.eskiz.uz/api"

// EskizConfig holds what the sender needs to talk to Eskiz.
//
// Eskiz authenticates with an email/password pair that is exchanged for a
// bearer token; there is no long-lived API key.
type EskizConfig struct {
	Email    string
	Password string

	// From is the registered sender ID. Eskiz's shared test sender is "4546";
	// a production sender must be registered with the operators.
	From string

	// MessageFormat must match a template approved by Eskiz moderation.
	// Uzbek operators reject unapproved message text, so this is configurable
	// rather than hardcoded — the approved wording is set per account.
	MessageFormat string

	BaseURL    string
	HTTPClient *http.Client
}

// EskizSender delivers verification codes by SMS through Eskiz.uz.
//
// Eskiz was chosen over an international gateway because Uzbek operators route
// transactional SMS through local agreements; a generic provider's traffic to
// +998 is unreliable without a registered sender ID.
type EskizSender struct {
	cfg    EskizConfig
	client *http.Client
	base   string

	// The bearer token is cached and re-fetched when the API rejects it.
	// Guarded because concurrent registrations share one sender.
	mu    sync.Mutex
	token string
}

// NewEskizSender builds a sender, failing fast on missing configuration.
func NewEskizSender(cfg EskizConfig) (*EskizSender, error) {
	if strings.TrimSpace(cfg.Email) == "" || strings.TrimSpace(cfg.Password) == "" {
		return nil, fmt.Errorf("eskiz: email and password are required")
	}
	if strings.TrimSpace(cfg.From) == "" {
		return nil, fmt.Errorf("eskiz: a registered sender id is required")
	}

	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	base := strings.TrimSuffix(cfg.BaseURL, "/")
	if base == "" {
		base = eskizBaseURL
	}

	return &EskizSender{cfg: cfg, client: client, base: base}, nil
}

// Send delivers the code.
//
// A rejected token is refreshed once and the send retried, because Eskiz tokens
// expire on their own schedule and a caller should not see a failure for that.
func (s *EskizSender) Send(ctx context.Context, destination, code string) error {
	token, err := s.ensureToken(ctx, false)
	if err != nil {
		return err
	}

	status, err := s.postMessage(ctx, token, destination, code)
	if err != nil {
		return err
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		token, err = s.ensureToken(ctx, true)
		if err != nil {
			return err
		}
		status, err = s.postMessage(ctx, token, destination, code)
		if err != nil {
			return err
		}
	}

	if status < 200 || status >= 300 {
		return fmt.Errorf("eskiz: send returned status %d", status)
	}
	return nil
}

// normalizePhone strips the leading plus: Eskiz expects 998901234567.
func normalizePhone(phone string) string {
	return strings.TrimPrefix(strings.TrimSpace(phone), "+")
}

func (s *EskizSender) postMessage(ctx context.Context, token, destination, code string) (int, error) {
	message := strings.ReplaceAll(s.cfg.MessageFormat, "{code}", code)

	// The send endpoint takes multipart form data.
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	fields := map[string]string{
		"mobile_phone": normalizePhone(destination),
		"message":      message,
		"from":         s.cfg.From,
	}
	for key, value := range fields {
		if err := form.WriteField(key, value); err != nil {
			return 0, fmt.Errorf("eskiz: build request: %w", err)
		}
	}
	if err := form.Close(); err != nil {
		return 0, fmt.Errorf("eskiz: build request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.base+"/message/sms/send", &body)
	if err != nil {
		return 0, fmt.Errorf("eskiz: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", form.FormDataContentType())

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("eskiz: send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 &&
		resp.StatusCode != http.StatusUnauthorized && resp.StatusCode != http.StatusForbidden {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return resp.StatusCode, fmt.Errorf("eskiz: status %d: %s",
			resp.StatusCode, strings.TrimSpace(string(detail)))
	}

	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
	return resp.StatusCode, nil
}

type eskizLoginResponse struct {
	Data struct {
		Token string `json:"token"`
	} `json:"data"`
}

// ensureToken returns a cached token, fetching a new one when there is none or
// when the caller reports the current one was rejected.
func (s *EskizSender) ensureToken(ctx context.Context, force bool) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.token != "" && !force {
		return s.token, nil
	}

	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	if err := form.WriteField("email", s.cfg.Email); err != nil {
		return "", fmt.Errorf("eskiz: build login request: %w", err)
	}
	if err := form.WriteField("password", s.cfg.Password); err != nil {
		return "", fmt.Errorf("eskiz: build login request: %w", err)
	}
	if err := form.Close(); err != nil {
		return "", fmt.Errorf("eskiz: build login request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.base+"/auth/login", &body)
	if err != nil {
		return "", fmt.Errorf("eskiz: build login request: %w", err)
	}
	req.Header.Set("Content-Type", form.FormDataContentType())

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("eskiz: login request: %w", err)
	}
	defer resp.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return "", fmt.Errorf("eskiz: read login response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// The password is never echoed into this message.
		return "", fmt.Errorf("eskiz: login returned status %d", resp.StatusCode)
	}

	var parsed eskizLoginResponse
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return "", fmt.Errorf("eskiz: decode login response: %w", err)
	}
	if parsed.Data.Token == "" {
		return "", fmt.Errorf("eskiz: login response contained no token")
	}

	s.token = parsed.Data.Token
	return s.token, nil
}
