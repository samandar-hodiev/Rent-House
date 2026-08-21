package notify

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"net"
	"strings"
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

// fakeSMTP is a mail server that speaks just enough of the protocol to record
// one conversation. It runs in-process over a real TCP socket, so the sender is
// exercised through its actual network path rather than a stubbed interface.
type fakeSMTP struct {
	listener net.Listener
	// rejectRcpt makes the server refuse the recipient, the way a real server
	// rejects an address it will not deliver to.
	rejectRcpt bool

	mailFrom string
	rcptTo   []string
	body     string
	done     chan struct{}
}

func newFakeSMTP(t *testing.T) *fakeSMTP {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	s := &fakeSMTP{listener: listener, done: make(chan struct{})}
	go s.serve()
	t.Cleanup(func() { _ = listener.Close() })
	return s
}

func (s *fakeSMTP) addr() (string, int) {
	a := s.listener.Addr().(*net.TCPAddr)
	return "127.0.0.1", a.Port
}

func (s *fakeSMTP) serve() {
	defer close(s.done)
	conn, err := s.listener.Accept()
	if err != nil {
		return
	}
	defer conn.Close()

	r := bufio.NewReader(conn)
	w := bufio.NewWriter(conn)
	say := func(format string, args ...any) {
		fmt.Fprintf(w, format+"\r\n", args...)
		_ = w.Flush()
	}

	say("220 fake ESMTP")
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		cmd := strings.ToUpper(strings.TrimSpace(line))

		switch {
		case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
			// No STARTTLS advertised: these tests run with skipTLS, which is
			// the only way encryption is ever skipped.
			say("250-fake")
			say("250 SIZE 35882577")
		case strings.HasPrefix(cmd, "MAIL FROM"):
			s.mailFrom = extractAddress(line)
			say("250 OK")
		case strings.HasPrefix(cmd, "RCPT TO"):
			if s.rejectRcpt {
				say("550 5.1.1 No such recipient")
				continue
			}
			s.rcptTo = append(s.rcptTo, extractAddress(line))
			say("250 OK")
		case cmd == "DATA":
			say("354 End data with <CR><LF>.<CR><LF>")
			var body bytes.Buffer
			for {
				dataLine, err := r.ReadString('\n')
				if err != nil {
					return
				}
				if strings.TrimRight(dataLine, "\r\n") == "." {
					break
				}
				body.WriteString(dataLine)
			}
			s.body = body.String()
			say("250 OK queued")
		case cmd == "QUIT":
			say("221 Bye")
			return
		default:
			say("250 OK")
		}
	}
}

func extractAddress(line string) string {
	start := strings.Index(line, "<")
	end := strings.LastIndex(line, ">")
	if start == -1 || end == -1 || end < start {
		return strings.TrimSpace(line)
	}
	return line[start+1 : end]
}

func newTestSMTPSender(t *testing.T, server *fakeSMTP) *SMTPSender {
	t.Helper()
	host, port := server.addr()
	sender, err := NewSMTPSender(SMTPConfig{
		Host: host, Port: port,
		Username: "renthouse@example.test", Password: "app-password",
		From:    "RentHouse <renthouse@example.test>",
		skipTLS: true,
	})
	if err != nil {
		t.Fatalf("build sender: %v", err)
	}
	return sender
}

// The requirement the whole provider exists for: the message goes to the
// address that was asked for, not to the configured mailbox.
func TestSMTPSendsToTheRequestedRecipient(t *testing.T) {
	server := newFakeSMTP(t)
	sender := newTestSMTPSender(t, server)

	if err := sender.Send(context.Background(), "someone-else@example.test", "483921"); err != nil {
		t.Fatalf("send: %v", err)
	}
	<-server.done

	if len(server.rcptTo) != 1 {
		t.Fatalf("got %d recipients, want 1: %v", len(server.rcptTo), server.rcptTo)
	}
	if server.rcptTo[0] != "someone-else@example.test" {
		t.Errorf("delivered to %q, want the requested address", server.rcptTo[0])
	}
	// The envelope sender is the configured mailbox, stripped of its display
	// name — and crucially it is not what the recipient was set to.
	if server.mailFrom != "renthouse@example.test" {
		t.Errorf("envelope sender is %q, want the bare configured address", server.mailFrom)
	}
	if server.rcptTo[0] == server.mailFrom {
		t.Error("the message was addressed back to the sending mailbox")
	}
}

// Two sends, two different inboxes. A regression that reused a recipient or
// fell back to the account mailbox fails here.
func TestSMTPKeepsRecipientsSeparateAcrossSends(t *testing.T) {
	var got []string
	for _, address := range []string{"alice@example.test", "bob@example.test"} {
		server := newFakeSMTP(t)
		sender := newTestSMTPSender(t, server)
		if err := sender.Send(context.Background(), address, "111111"); err != nil {
			t.Fatalf("send to %s: %v", address, err)
		}
		<-server.done
		if len(server.rcptTo) != 1 {
			t.Fatalf("send to %s produced %d recipients", address, len(server.rcptTo))
		}
		got = append(got, server.rcptTo[0])
	}

	if got[0] != "alice@example.test" || got[1] != "bob@example.test" {
		t.Fatalf("recipients were %v, want them in order and unchanged", got)
	}
	if got[0] == got[1] {
		t.Error("both messages landed in the same inbox")
	}
}

// The body must carry the code and a readable subject, and nothing secret.
func TestSMTPMessageCarriesTheCodeAndAnEncodedSubject(t *testing.T) {
	server := newFakeSMTP(t)
	sender := newTestSMTPSender(t, server)

	if err := sender.Send(context.Background(), "user@example.test", "483921"); err != nil {
		t.Fatalf("send: %v", err)
	}
	<-server.done

	if !strings.Contains(server.body, "483921") {
		t.Error("the message does not contain the verification code")
	}
	if !strings.Contains(server.body, "To: user@example.test") {
		t.Errorf("the To header does not name the recipient:\n%s", server.body)
	}
	// Both alternatives are present, so a text-only client still gets the code.
	for _, want := range []string{"multipart/alternative", "text/plain", "text/html"} {
		if !strings.Contains(server.body, want) {
			t.Errorf("the message is missing %q", want)
		}
	}
	// The default subject is pure ASCII, so it travels as-is — encoding it
	// would only make it harder to read in a mail client.
	if !strings.Contains(server.body, "Subject: "+defaultEmailSubject) {
		t.Errorf("the subject header is wrong:\n%s", firstLines(server.body, 6))
	}
	if strings.Contains(server.body, "app-password") {
		t.Error("the message leaked the SMTP password")
	}
}

// A subject with non-ASCII characters has to be encoded, or it arrives as
// mojibake. This is what would break if the wording were ever translated.
func TestSMTPEncodesANonASCIISubject(t *testing.T) {
	server := newFakeSMTP(t)
	host, port := server.addr()
	sender, err := NewSMTPSender(SMTPConfig{
		Host: host, Port: port,
		Username: "u", Password: "p", From: "f@example.test",
		Subject: "Ваш код подтверждения",
		skipTLS: true,
	})
	if err != nil {
		t.Fatalf("build sender: %v", err)
	}

	if err := sender.Send(context.Background(), "user@example.test", "483921"); err != nil {
		t.Fatalf("send: %v", err)
	}
	<-server.done

	if strings.Contains(server.body, "Subject: Ваш") {
		t.Errorf("a non-ASCII subject was sent raw:\n%s", firstLines(server.body, 6))
	}
	if !strings.Contains(server.body, "Subject: =?utf-8?q?") {
		t.Errorf("a non-ASCII subject was not MIME-encoded:\n%s", firstLines(server.body, 6))
	}
}

// A refused recipient has to surface as an error, or the API would answer
// "code sent" for a message no one will ever receive.
func TestSMTPRejectedRecipientIsAnError(t *testing.T) {
	server := newFakeSMTP(t)
	server.rejectRcpt = true
	sender := newTestSMTPSender(t, server)

	err := sender.Send(context.Background(), "nobody@example.test", "483921")
	if err == nil {
		t.Fatal("a refused recipient reported success")
	}
	if strings.Contains(err.Error(), "483921") {
		t.Error("the error carries the verification code")
	}
	if strings.Contains(err.Error(), "app-password") {
		t.Error("the error carries the SMTP password")
	}
}

func TestSMTPLogsTheSendWithoutLeakingSecrets(t *testing.T) {
	server := newFakeSMTP(t)
	sender := newTestSMTPSender(t, server)

	var buf bytes.Buffer
	restore := logger.SwapOutput(&buf)
	defer restore()

	if err := sender.Send(context.Background(), "alice@example.test", "483921"); err != nil {
		t.Fatalf("send: %v", err)
	}
	<-server.done

	out := buf.String()
	for _, want := range []string{"provider=smtp", "status=accepted", "a***@example.test"} {
		if !strings.Contains(out, want) {
			t.Errorf("log is missing %q; got %q", want, out)
		}
	}
	for _, leak := range []string{"483921", "app-password", "alice@example.test"} {
		if strings.Contains(out, leak) {
			t.Errorf("log leaked %q; got %q", leak, out)
		}
	}
}

func TestSMTPRequiresConfiguration(t *testing.T) {
	full := SMTPConfig{
		Host: "smtp.example.test", Port: 587,
		Username: "u", Password: "p", From: "f@example.test",
	}

	cases := map[string]func(*SMTPConfig){
		"missing host":     func(c *SMTPConfig) { c.Host = "" },
		"missing port":     func(c *SMTPConfig) { c.Port = 0 },
		"missing username": func(c *SMTPConfig) { c.Username = "" },
		"missing password": func(c *SMTPConfig) { c.Password = "" },
		"missing from":     func(c *SMTPConfig) { c.From = "" },
	}

	for name, break_ := range cases {
		t.Run(name, func(t *testing.T) {
			cfg := full
			break_(&cfg)
			if _, err := NewSMTPSender(cfg); err == nil {
				t.Error("a misconfigured sender was accepted")
			}
		})
	}

	if _, err := NewSMTPSender(full); err != nil {
		t.Errorf("a complete configuration was rejected: %v", err)
	}
}

func TestSenderAddressStripsTheDisplayName(t *testing.T) {
	cases := map[string]string{
		"RentHouse <no-reply@example.test>": "no-reply@example.test",
		"no-reply@example.test":             "no-reply@example.test",
		"  spaced@example.test  ":           "spaced@example.test",
	}
	for input, want := range cases {
		if got := senderAddress(input); got != want {
			t.Errorf("senderAddress(%q) = %q, want %q", input, got, want)
		}
	}
}

// The factory must build it, and must still refuse a name it does not know.
func TestFactoryBuildsTheSMTPSender(t *testing.T) {
	sender, err := BuildEmailSender(Settings{
		EmailProvider: ProviderSMTP,
		SMTP: SMTPConfig{
			Host: "smtp.example.test", Port: 587,
			Username: "u", Password: "p", From: "f@example.test",
		},
	})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if _, ok := sender.(*SMTPSender); !ok {
		t.Fatalf("got %T, want *SMTPSender", sender)
	}
	if IsSimulated(sender) {
		t.Error("the SMTP sender reports itself as simulated")
	}

	if _, err := BuildEmailSender(Settings{EmailProvider: ProviderSMTP}); err == nil {
		t.Error("an unconfigured SMTP provider was accepted")
	}
}

func firstLines(s string, n int) string {
	lines := strings.SplitN(s, "\n", n+1)
	if len(lines) > n {
		lines = lines[:n]
	}
	return strings.Join(lines, "\n")
}
