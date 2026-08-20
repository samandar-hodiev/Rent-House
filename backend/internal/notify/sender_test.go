package notify

import (
	"context"
	"testing"
)

func TestDevelopmentSendersDoNotFail(t *testing.T) {
	ctx := context.Background()

	if err := (DevelopmentSMSSender{}).Send(ctx, "+998901234567", "483921"); err != nil {
		t.Fatalf("sms sender: %v", err)
	}
	if err := (DevelopmentEmailSender{}).Send(ctx, "user@example.test", "483921"); err != nil {
		t.Fatalf("email sender: %v", err)
	}
}

func TestPhoneIsMasked(t *testing.T) {
	cases := map[string]string{
		"+998901234567": "***4567",
		"1234":          "***",
		"":              "***",
	}
	for input, want := range cases {
		if got := maskPhone(input); got != want {
			t.Errorf("maskPhone(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestEmailIsMasked(t *testing.T) {
	cases := map[string]string{
		"samandar@example.com": "s***@example.com",
		"a@example.com":        "***@example.com",
		"no-at-sign":           "***",
	}
	for input, want := range cases {
		if got := maskEmail(input); got != want {
			t.Errorf("maskEmail(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestSenderFuncSatisfiesTheInterface(t *testing.T) {
	var captured string
	var sender Sender = SenderFunc(func(_ context.Context, _, code string) error {
		captured = code
		return nil
	})

	if err := sender.Send(context.Background(), "dest", "483921"); err != nil {
		t.Fatalf("send: %v", err)
	}
	if captured != "483921" {
		t.Fatalf("got %q, want the code passed through", captured)
	}
}
