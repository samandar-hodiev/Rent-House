package notify

import (
	"context"
	"crypto/tls"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

// SMTPSender delivers verification codes over plain SMTP.
//
// It exists because the API providers that need no domain are the ones that
// cannot send to arbitrary recipients. Resend, for one, will only deliver to
// the account owner's own address until a domain is verified — which is fine
// for a shipped product and useless while building one.
//
// SMTP has no such gate: a mailbox that can send can send to anyone. Pointing
// this at Gmail with an app password gets real delivery to real recipients
// today, and the same code works unchanged against Brevo, SendGrid, Mailgun or
// a self-hosted relay, because they all speak SMTP. Switching provider becomes
// a change of four environment variables.
//
// The trade-off is honest: mail arrives from whatever mailbox is configured,
// not from a RentHouse domain, and consumer providers cap daily volume. Once a
// domain is verified, EMAIL_PROVIDER=resend takes over with no code change.

// SMTPConfig is what the sender needs to reach a mail server.
type SMTPConfig struct {
	Host string
	Port int
	// Username and Password authenticate to the server. For Gmail the password
	// is an app password, never the account password.
	Username string
	Password string
	// From is the envelope and header sender. Most servers require it to match
	// the authenticated mailbox; Gmail rewrites it if it does not.
	From string

	Subject    string
	BodyFormat string

	// dial is swapped in tests. Empty means a real network connection.
	dial func(ctx context.Context, addr string) (net.Conn, error)
	// skipTLS is for tests against a local plaintext server. It is deliberately
	// unexported so no configuration file can turn encryption off.
	skipTLS bool
}

type SMTPSender struct {
	cfg  SMTPConfig
	addr string
}

// NewSMTPSender builds a sender, failing fast on missing configuration so a
// misconfigured deployment cannot start and silently drop every code.
func NewSMTPSender(cfg SMTPConfig) (*SMTPSender, error) {
	if strings.TrimSpace(cfg.Host) == "" {
		return nil, fmt.Errorf("smtp: SMTP_HOST is required")
	}
	if cfg.Port <= 0 {
		return nil, fmt.Errorf("smtp: SMTP_PORT must be a positive port number")
	}
	if strings.TrimSpace(cfg.Username) == "" {
		return nil, fmt.Errorf("smtp: SMTP_USERNAME is required")
	}
	if strings.TrimSpace(cfg.Password) == "" {
		return nil, fmt.Errorf("smtp: SMTP_PASSWORD is required")
	}
	if strings.TrimSpace(cfg.From) == "" {
		return nil, fmt.Errorf("smtp: SMTP_FROM is required")
	}

	return &SMTPSender{cfg: cfg, addr: net.JoinHostPort(cfg.Host, fmt.Sprint(cfg.Port))}, nil
}

// Send delivers the code, returning an error if the server does not accept it.
func (s *SMTPSender) Send(ctx context.Context, destination, code string) error {
	message := s.buildMessage(destination, code)

	if err := s.deliver(ctx, destination, message); err != nil {
		logger.Errorf("email OTP request: recipient=%s provider=smtp status=rejected error=%v",
			maskEmail(destination), err)
		return fmt.Errorf("smtp: %w", err)
	}

	// SMTP has no message id to quote, so the log records that the server
	// accepted the message for this recipient. The address is masked, and the
	// code, the password and the token never appear.
	logger.Infof("email OTP request: recipient=%s provider=smtp status=accepted host=%s",
		maskEmail(destination), s.cfg.Host)
	return nil
}

// SendLink delivers a password-reset link.
//
// The same transport and the same logging as Send — only the message differs,
// so a change to how mail is delivered cannot apply to one and miss the other.
func (s *SMTPSender) SendLink(ctx context.Context, destination, link string) error {
	text, htmlBody := renderResetEmail(link)
	message := s.compose(destination, resetEmailSubject, text, htmlBody)

	if err := s.deliver(ctx, destination, message); err != nil {
		logger.Errorf("email reset request: recipient=%s provider=smtp status=rejected error=%v",
			maskEmail(destination), err)
		return fmt.Errorf("smtp: %w", err)
	}
	// The address is masked and the link never appears: a reset link in a log
	// is a password in a log.
	logger.Infof("email reset request: recipient=%s provider=smtp status=accepted host=%s",
		maskEmail(destination), s.cfg.Host)
	return nil
}

// buildMessage assembles a multipart/alternative message: the HTML for clients
// that render it, the plain text for those that do not and for spam filters
// that prefer a message to carry both.
func (s *SMTPSender) buildMessage(destination, code string) []byte {
	text, htmlBody := renderEmail(s.cfg.BodyFormat, code)

	subject := s.cfg.Subject
	if strings.TrimSpace(subject) == "" {
		subject = defaultEmailSubject
	}
	return s.compose(destination, subject, text, htmlBody)
}

// compose builds the envelope both messages share. Only subject and content
// differ between a verification code and a reset link, so only those are
// parameters.
func (s *SMTPSender) compose(destination, subject, text, htmlBody string) []byte {
	// The subject is Uzbek and carries non-ASCII, so it is encoded rather than
	// sent raw — an unencoded header is what turns "tasdiqlash" into mojibake.
	boundary := fmt.Sprintf("renthouse-%d", time.Now().UnixNano())

	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", s.cfg.From)
	fmt.Fprintf(&b, "To: %s\r\n", destination)
	fmt.Fprintf(&b, "Subject: %s\r\n", mime.QEncoding.Encode("utf-8", subject))
	fmt.Fprintf(&b, "Date: %s\r\n", time.Now().Format(time.RFC1123Z))
	b.WriteString("MIME-Version: 1.0\r\n")
	// Verification mail is transactional; this asks well-behaved clients not to
	// send an auto-reply and marks it as not bulk.
	b.WriteString("Auto-Submitted: auto-generated\r\n")
	fmt.Fprintf(&b, "Content-Type: multipart/alternative; boundary=%q\r\n\r\n", boundary)

	fmt.Fprintf(&b, "--%s\r\n", boundary)
	b.WriteString("Content-Type: text/plain; charset=\"utf-8\"\r\n\r\n")
	b.WriteString(text)
	b.WriteString("\r\n\r\n")

	fmt.Fprintf(&b, "--%s\r\n", boundary)
	b.WriteString("Content-Type: text/html; charset=\"utf-8\"\r\n\r\n")
	b.WriteString(htmlBody)
	b.WriteString("\r\n\r\n")

	fmt.Fprintf(&b, "--%s--\r\n", boundary)
	return []byte(b.String())
}

// deliver runs one SMTP conversation.
//
// Written against net/smtp directly rather than smtp.SendMail so the context
// deadline is honoured and so port 465 works: SendMail only ever speaks
// STARTTLS, and 465 expects TLS from the first byte.
func (s *SMTPSender) deliver(ctx context.Context, destination string, message []byte) error {
	conn, err := s.connect(ctx)
	if err != nil {
		return err
	}

	client, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("open session: %w", err)
	}
	defer func() { _ = client.Close() }()

	// A cancelled context must not leave the connection hanging open.
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			_ = conn.Close()
		case <-done:
		}
	}()

	// Implicit TLS already encrypted the socket. Otherwise upgrade, and refuse
	// to continue in the clear: the password would cross the wire in plaintext.
	if !s.isImplicitTLS() && !s.cfg.skipTLS {
		ok, _ := client.Extension("STARTTLS")
		if !ok {
			return fmt.Errorf("server does not offer STARTTLS; refusing to send credentials in the clear")
		}
		if err := client.StartTLS(&tls.Config{ServerName: s.cfg.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return fmt.Errorf("start tls: %w", err)
		}
	}

	if !s.cfg.skipTLS {
		auth := smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)
		if err := client.Auth(auth); err != nil {
			// The server's wording helps an operator spot a bad app password.
			// It reaches the log only; the caller replaces it with a generic
			// message, and it never contains the code.
			return fmt.Errorf("authenticate: %w", err)
		}
	}

	if err := client.Mail(senderAddress(s.cfg.From)); err != nil {
		return fmt.Errorf("set sender: %w", err)
	}
	// The one place the recipient is chosen, and it is the address handed in.
	if err := client.Rcpt(destination); err != nil {
		return fmt.Errorf("set recipient: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("open body: %w", err)
	}
	if _, err := w.Write(message); err != nil {
		_ = w.Close()
		return fmt.Errorf("write body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("finish body: %w", err)
	}

	return client.Quit()
}

func (s *SMTPSender) isImplicitTLS() bool { return s.cfg.Port == 465 }

func (s *SMTPSender) connect(ctx context.Context) (net.Conn, error) {
	if s.cfg.dial != nil {
		return s.cfg.dial(ctx, s.addr)
	}

	dialer := &net.Dialer{Timeout: 15 * time.Second}
	if s.isImplicitTLS() {
		tlsDialer := &tls.Dialer{
			NetDialer: dialer,
			Config:    &tls.Config{ServerName: s.cfg.Host, MinVersion: tls.VersionTLS12},
		}
		conn, err := tlsDialer.DialContext(ctx, "tcp", s.addr)
		if err != nil {
			return nil, fmt.Errorf("connect: %w", err)
		}
		return conn, nil
	}

	conn, err := dialer.DialContext(ctx, "tcp", s.addr)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	return conn, nil
}

// senderAddress strips a display name: the envelope takes a bare address, so
// `RentHouse <me@gmail.com>` has to become `me@gmail.com`.
func senderAddress(from string) string {
	if start := strings.LastIndex(from, "<"); start != -1 {
		if end := strings.Index(from[start:], ">"); end != -1 {
			return strings.TrimSpace(from[start+1 : start+end])
		}
	}
	return strings.TrimSpace(from)
}
