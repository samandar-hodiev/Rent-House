package notify

import (
	"fmt"
	"html"
	"strings"
)

// The verification email.
//
// It carries the code and nothing else: no password, no JWT, no registration
// token, no database id. Anyone who can read the mailbox can read this message,
// so it says only what the recipient needs in order to finish signing up.
const (
	defaultEmailSubject = "RentHouse tasdiqlash kodi"

	// {code} is substituted at send time.
	defaultEmailText = `RentHouse

Sizning tasdiqlash kodingiz:

{code}

Kod 5 daqiqa amal qiladi.

Agar bu siz bo'lmasangiz, bu xatga e'tibor bermang.`
)

// Deliberately plain HTML: no external stylesheet, no images, no tracking
// pixel. Mail clients strip most CSS anyway, and a verification message that
// renders in every client beats one that looks better in some.
const defaultEmailHTML = `<!doctype html>
<html lang="uz">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
      <p style="margin:0 0 24px;font-size:18px;font-weight:600;">RentHouse</p>
      <p style="margin:0 0 12px;font-size:14px;color:#334155;">Sizning tasdiqlash kodingiz:</p>
      <p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:6px;">{code}</p>
      <p style="margin:0 0 8px;font-size:14px;color:#334155;">Kod 5 daqiqa amal qiladi.</p>
      <p style="margin:0;font-size:13px;color:#64748b;">Agar bu siz bo'lmasangiz, bu xatga e'tibor bermang.</p>
    </div>
  </body>
</html>`

// renderEmail substitutes the code into the plain-text and HTML bodies.
//
// The code is HTML-escaped on the way into the markup. It is six digits today,
// so nothing can go wrong — but the escaping means a future change to the code
// format cannot turn this template into an injection point.
func renderEmail(textFormat, code string) (text, htmlBody string) {
	if strings.TrimSpace(textFormat) == "" {
		textFormat = defaultEmailText
	}
	text = strings.ReplaceAll(textFormat, "{code}", code)
	htmlBody = strings.ReplaceAll(defaultEmailHTML, "{code}", html.EscapeString(code))
	return text, htmlBody
}

// describeStatus turns a provider status into a short operator-facing note.
// Used only in logs, never in a response.
func describeStatus(status int, detail string) string {
	switch {
	case status == 401 || status == 403:
		return fmt.Sprintf("status %d — check RESEND_API_KEY and that RESEND_FROM is on a verified domain: %s", status, detail)
	case status == 422:
		return fmt.Sprintf("status %d — Resend rejected the message: %s", status, detail)
	case status >= 500:
		return fmt.Sprintf("status %d — Resend is failing: %s", status, detail)
	default:
		return fmt.Sprintf("status %d: %s", status, detail)
	}
}
