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

// The password-reset email.
//
// It carries a link and nothing else — no password, no account id, no hint that
// the address is registered beyond the fact the message arrived. Whoever can
// read the mailbox can act on it, which is exactly the property the link's
// short life and single use are there to bound.
const (
	resetEmailSubject = "RentHouse parolni tiklash"

	// {link} is substituted at send time.
	resetEmailText = `RentHouse

Parolni tiklash uchun quyidagi havolaga o'ting:

{link}

Havola 30 daqiqa amal qiladi va bir marta ishlaydi.

Agar parolni tiklashni siz so'ramagan bo'lsangiz, bu xatga e'tibor bermang —
hisobingiz o'zgarishsiz qoladi.`
)

const resetEmailHTML = `<!doctype html>
<html lang="uz">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
      <p style="margin:0 0 24px;font-size:18px;font-weight:600;">RentHouse</p>
      <p style="margin:0 0 20px;font-size:14px;color:#334155;">Parolni tiklash uchun quyidagi tugmani bosing:</p>
      <p style="margin:0 0 24px;">
        <a href="{link}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;">Parolni tiklash</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Tugma ishlamasa, havolani brauzerga nusxalang:</p>
      <p style="margin:0 0 20px;font-size:12px;color:#64748b;word-break:break-all;">{link}</p>
      <p style="margin:0 0 8px;font-size:14px;color:#334155;">Havola 30 daqiqa amal qiladi va bir marta ishlaydi.</p>
      <p style="margin:0;font-size:13px;color:#64748b;">Agar buni siz so'ramagan bo'lsangiz, xatga e'tibor bermang.</p>
    </div>
  </body>
</html>`

// renderResetEmail substitutes the link into both bodies.
//
// Escaped twice over, and deliberately: once for the text of the page and once
// for the href, because a URL placed in an attribute unescaped is how a link
// becomes a way to inject markup into somebody else's mail client.
func renderResetEmail(link string) (text, htmlBody string) {
	text = strings.ReplaceAll(resetEmailText, "{link}", link)
	htmlBody = strings.ReplaceAll(resetEmailHTML, "{link}", html.EscapeString(link))
	return text, htmlBody
}
