// No integration tag: validationMessage touches neither the database nor the
// network, so this runs with a plain `go test ./...`.
package handler

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestValidationMessageRewordsABodyTooLargeError checks the one error this
// function is not allowed to pass through verbatim: middleware.LimitRequestBody
// wraps a request's body in exactly this reader, and Go's own wording for it
// ("http: request body too large") is not something to hand a client as if it
// were a description of what they did wrong.
func TestValidationMessageRewordsABodyTooLargeError(t *testing.T) {
	rec := httptest.NewRecorder()
	body := io.NopCloser(strings.NewReader("far more bytes than the limit below allows"))
	limited := http.MaxBytesReader(rec, body, 5)

	_, err := io.ReadAll(limited)
	if err == nil {
		t.Fatal("expected the oversized body to produce an error")
	}

	got := validationMessage(err)
	if got != "Request body is too large" {
		t.Fatalf("got %q, want the reworded message", got)
	}
}

func TestValidationMessageKeepsOrdinaryErrorsAsIs(t *testing.T) {
	got := validationMessage(errors.New("email is required"))
	want := "Invalid request: email is required"
	if got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestValidationMessageHandlesNil(t *testing.T) {
	if got := validationMessage(nil); got != "Invalid request" {
		t.Fatalf("got %q, want the no-detail fallback", got)
	}
}
