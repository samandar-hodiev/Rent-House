package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// resendEndpoint is the transactional send endpoint. Overridable so tests can
// point it at a local server instead of the real API.
const resendEndpoint = "https://api.resend.com/emails"

// ResendConfig holds what the sender needs to talk to Resend.
type ResendConfig struct {
	APIKey string
	// From must be an address on a domain verified in the Resend dashboard.
	// Until a domain is verified, Resend only accepts onboarding@resend.dev and
	// only delivers to the account owner's own address.
	From string
	// Subject and BodyFormat shape the message. Kept configurable because the
	// wording is a product decision, not a technical one.
	Subject    string
	BodyFormat string

	// BaseURL is for tests. Empty means the real API.
	BaseURL string
	// HTTPClient is for tests. Empty means a client with a sane timeout.
	HTTPClient *http.Client
}

// ResendSender delivers verification codes by email through Resend.
//
// It reports a failure as an error rather than swallowing it: the caller must
// not tell a user "code sent" when the provider rejected the request.
type ResendSender struct {
	cfg    ResendConfig
	client *http.Client
	url    string
}

// NewResendSender builds a sender. It fails fast on missing configuration,
// so a misconfigured deployment cannot start and silently drop every code.
func NewResendSender(cfg ResendConfig) (*ResendSender, error) {
	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, fmt.Errorf("resend: API key is required")
	}
	if strings.TrimSpace(cfg.From) == "" {
		return nil, fmt.Errorf("resend: a verified sender address is required")
	}

	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	url := cfg.BaseURL
	if url == "" {
		url = resendEndpoint
	}

	return &ResendSender{cfg: cfg, client: client, url: url}, nil
}

type resendRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Text    string   `json:"text"`
}

// Send delivers the code, returning an error if Resend does not accept it.
func (s *ResendSender) Send(ctx context.Context, destination, code string) error {
	payload := resendRequest{
		From:    s.cfg.From,
		To:      []string{destination},
		Subject: s.cfg.Subject,
		Text:    strings.ReplaceAll(s.cfg.BodyFormat, "{code}", code),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("resend: encode request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("resend: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("resend: send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// The provider's message is useful for diagnosing a bad key or an
		// unverified domain, and contains nothing secret — the code is not
		// echoed back in an error body.
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("resend: status %d: %s", resp.StatusCode, strings.TrimSpace(string(detail)))
	}

	// The response carries a message id. It is intentionally not logged
	// alongside the destination, to keep recipient addresses out of the logs.
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
	return nil
}
