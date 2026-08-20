package notify

import (
	"fmt"
	"strings"
)

// Provider names accepted by the configuration.
const (
	ProviderDev    = "dev"
	ProviderResend = "resend"
	ProviderEskiz  = "eskiz"
)

// Settings selects and configures the delivery providers.
type Settings struct {
	EmailProvider string
	SMSProvider   string
	Resend        ResendConfig
	Eskiz         EskizConfig
}

// BuildEmailSender returns the configured email sender.
//
// An unknown or misconfigured provider is an error, never a quiet fallback to
// the development sender: a deployment that thinks it is emailing users while
// only writing to its own log is worse than one that refuses to start.
func BuildEmailSender(s Settings) (Sender, error) {
	switch strings.ToLower(strings.TrimSpace(s.EmailProvider)) {
	case "", ProviderDev:
		return DevelopmentEmailSender{}, nil
	case ProviderResend:
		return NewResendSender(s.Resend)
	default:
		return nil, fmt.Errorf("unknown email provider %q (expected %q or %q)",
			s.EmailProvider, ProviderDev, ProviderResend)
	}
}

// BuildSMSSender returns the configured SMS sender, under the same rule.
func BuildSMSSender(s Settings) (Sender, error) {
	switch strings.ToLower(strings.TrimSpace(s.SMSProvider)) {
	case "", ProviderDev:
		return DevelopmentSMSSender{}, nil
	case ProviderEskiz:
		return NewEskizSender(s.Eskiz)
	default:
		return nil, fmt.Errorf("unknown sms provider %q (expected %q or %q)",
			s.SMSProvider, ProviderDev, ProviderEskiz)
	}
}

// IsDevelopment reports whether a provider name means "log it, do not send it".
func IsDevelopment(provider string) bool {
	name := strings.ToLower(strings.TrimSpace(provider))
	return name == "" || name == ProviderDev
}
