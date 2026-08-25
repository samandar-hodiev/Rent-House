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

	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
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
	HTML    string   `json:"html"`
}

// Send delivers the code, returning an error if Resend does not accept it.
func (s *ResendSender) Send(ctx context.Context, destination, code string) error {
	// Both parts are sent: the HTML for clients that render it, the text for
	// those that do not and for spam filters that prefer a multipart message.
	text, htmlBody := renderEmail(s.cfg.BodyFormat, code)

	subject := s.cfg.Subject
	if strings.TrimSpace(subject) == "" {
		subject = defaultEmailSubject
	}
	return s.post(ctx, destination, subject, text, htmlBody, "OTP")
}

// SendLink delivers a password-reset link through the same provider.
func (s *ResendSender) SendLink(ctx context.Context, destination, link string) error {
	text, htmlBody := renderResetEmail(link)
	return s.post(ctx, destination, resetEmailSubject, text, htmlBody, "reset")
}

// post is the request both messages make. `kind` appears only in the log line,
// so an operator can tell a code from a link without either being written down.
func (s *ResendSender) post(
	ctx context.Context, destination, subject, text, htmlBody, kind string,
) error {
	payload := resendRequest{
		From:    s.cfg.From,
		To:      []string{destination},
		Subject: subject,
		Text:    text,
		HTML:    htmlBody,
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
		// The provider's reason helps an operator diagnose a bad key or an
		// unverified domain. It goes into the returned error, which the service
		// logs and then replaces with a generic message — it never reaches the
		// browser, and it never contains the code.
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		logger.Errorf("email %s request: recipient=%s provider=resend status=rejected http=%d",
			kind,
			maskEmail(destination), resp.StatusCode)
		return fmt.Errorf("resend: %s", describeStatus(resp.StatusCode, strings.TrimSpace(string(detail))))
	}

	// One line per accepted message, carrying the id Resend files the delivery
	// event under. That id is what turns "the API accepted it" into a claim an
	// operator can actually check on the dashboard — including who the real
	// recipient was, which is the question this log exists to answer.
	//
	// The address is masked because these logs outlive the request and a full
	// inbox address is personal data; the domain and first character are enough
	// to tell two recipients apart at a glance, and the message id settles it
	// exactly. The code, the API key and the token never appear here.
	var accepted struct {
		ID string `json:"id"`
	}
	payloadBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	_ = json.Unmarshal(payloadBody, &accepted)

	logger.Infof("email %s request: recipient=%s provider=resend status=accepted message_id=%s",
		kind,
		maskEmail(destination), accepted.ID)
	return nil
}
