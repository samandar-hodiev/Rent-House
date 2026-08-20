// Package notify delivers verification codes.
//
// The service depends on the Sender interface, never on a concrete provider, so
// swapping the development logger for Eskiz, Twilio or SendGrid later is a
// change of one line in main.go.
package notify

import (
	"context"
	"fmt"

	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

// Sender delivers a verification code to a destination — a phone number or an
// email address, depending on the implementation.
type Sender interface {
	Send(ctx context.Context, destination, code string) error
}

// SenderFunc adapts a function to the Sender interface, which is convenient in
// tests.
type SenderFunc func(ctx context.Context, destination, code string) error

func (f SenderFunc) Send(ctx context.Context, destination, code string) error {
	return f(ctx, destination, code)
}

// DevelopmentSMSSender writes the code to the server log instead of sending an
// SMS, so the registration flow is usable without an SMS account.
//
// It logs the code deliberately — that is the point of it in development — and
// must never be wired up in production, where the code would end up in log
// aggregation. main.go chooses the sender, so that choice is visible in one
// place.
type DevelopmentSMSSender struct{}

func (DevelopmentSMSSender) Send(_ context.Context, destination, code string) error {
	logger.Infof("[dev sms] verification code for %s: %s", maskPhone(destination), code)
	return nil
}

// DevelopmentEmailSender is the email equivalent of DevelopmentSMSSender.
type DevelopmentEmailSender struct{}

func (DevelopmentEmailSender) Send(_ context.Context, destination, code string) error {
	logger.Infof("[dev email] verification code for %s: %s", maskEmail(destination), code)
	return nil
}

// The destination is masked even in development: the code is what a developer
// needs, the full contact detail is not, and these lines often outlive the
// session they were written in.
func maskPhone(phone string) string {
	if len(phone) <= 4 {
		return "***"
	}
	return "***" + phone[len(phone)-4:]
}

func maskEmail(email string) string {
	for i, r := range email {
		if r == '@' {
			if i <= 1 {
				return "***" + email[i:]
			}
			return fmt.Sprintf("%c***%s", email[0], email[i:])
		}
	}
	return "***"
}
