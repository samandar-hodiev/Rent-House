//go:build integration

// Replying to a message, and removing a selection of them in one action.
//
// Both are batchings or extensions of things chat already did, so most of what
// these check is that the existing rules still hold: only an author withdraws
// something from both sides, and a quote cannot reach outside its thread.
package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
)

// --- helpers ---------------------------------------------------------------

// sayReplying answers `replyTo` and returns the stored message.
func (h *chatHarness) sayReplying(
	t *testing.T, conversationID, token, body, replyTo string,
) dto.MessageResponse {
	t.Helper()
	payload := map[string]any{"body": body}
	if replyTo != "" {
		payload["reply_to_message_id"] = replyTo
	}
	rec := h.do(t, http.MethodPost,
		"/api/v1/conversations/"+conversationID+"/messages", payload, token)
	if rec.Code != http.StatusCreated && rec.Code != http.StatusOK {
		t.Fatalf("send got status %d: %s", rec.Code, rec.Body.String())
	}
	var message dto.MessageResponse
	if err := json.Unmarshal(decode(t, rec).Data, &message); err != nil {
		t.Fatalf("decode message: %v", err)
	}
	return message
}

func (h *chatHarness) tryReply(
	t *testing.T, conversationID, token, body, replyTo string,
) int {
	t.Helper()
	return h.do(t, http.MethodPost,
		"/api/v1/conversations/"+conversationID+"/messages",
		map[string]any{"body": body, "reply_to_message_id": replyTo}, token).Code
}

func (h *chatHarness) deleteMany(t *testing.T, token, scope string, ids ...string) int {
	t.Helper()
	return h.do(t, http.MethodPost, "/api/v1/messages/delete",
		map[string]any{"ids": ids, "scope": scope}, token).Code
}

// --- reply -----------------------------------------------------------------

func TestReplyToTheOtherPersonsMessage(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, buyerToken := h.thread(t)

	original := h.sayReplying(t, id, buyerToken, "Bu uy hali bo'shmi?", "")
	reply := h.sayReplying(t, id, ownerToken, "Ha, hali bo'sh.", original.ID.String())

	if reply.ReplyTo == nil {
		t.Fatal("reply came back without the message it answers")
	}
	if reply.ReplyTo.ID != original.ID {
		t.Fatalf("reply quotes %s, want %s", reply.ReplyTo.ID, original.ID)
	}
	if reply.ReplyTo.Body != "Bu uy hali bo'shmi?" {
		t.Fatalf("quote carries %q", reply.ReplyTo.Body)
	}
	if reply.ReplyTo.SenderID != original.SenderID {
		t.Fatal("quote names the wrong sender")
	}

	// And it survives a reload, which is what proves it was stored rather than
	// only echoed back.
	for _, m := range h.messages(t, id, buyerToken) {
		if m.ID != reply.ID {
			continue
		}
		if m.ReplyTo == nil || m.ReplyTo.ID != original.ID {
			t.Fatal("the reply lost its quote on reload")
		}
		return
	}
	t.Fatal("reply missing from the thread")
}

func TestReplyToOwnMessage(t *testing.T) {
	h := newChatHarness(t)
	id, _, buyerToken := h.thread(t)

	original := h.sayReplying(t, id, buyerToken, "3 xonali uy haqida", "")
	reply := h.sayReplying(t, id, buyerToken, "Qo'shimcha savol", original.ID.String())

	if reply.ReplyTo == nil || reply.ReplyTo.ID != original.ID {
		t.Fatal("a reply to one's own message did not keep its quote")
	}
}

// A quote carries the original's text, so quoting across threads would be a way
// to read a conversation you are not in.
func TestReplyCannotQuoteAnotherThread(t *testing.T) {
	h := newChatHarness(t)
	first, _, firstBuyer := h.thread(t)
	second, _, secondBuyer := h.thread(t)

	outsider := h.sayReplying(t, first, firstBuyer, "Boshqa suhbatdagi xabar", "")

	if code := h.tryReply(t, second, secondBuyer, "quote", outsider.ID.String()); code == http.StatusCreated ||
		code == http.StatusOK {
		t.Fatal("a message from another thread could be quoted")
	}
}

// Withdrawing a message must not take the replies to it with it, and must not
// leave its text readable inside a quote.
func TestWithdrawingAMessageEmptiesItsQuotes(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, buyerToken := h.thread(t)

	original := h.sayReplying(t, id, buyerToken, "Maxfiy matn", "")
	reply := h.sayReplying(t, id, ownerToken, "Javob", original.ID.String())

	rec := h.do(t, http.MethodDelete, "/api/v1/messages/"+original.ID.String(),
		map[string]any{"scope": "everyone"}, buyerToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete got status %d: %s", rec.Code, rec.Body.String())
	}

	var found bool
	for _, m := range h.messages(t, id, ownerToken) {
		if m.ID != reply.ID {
			continue
		}
		found = true
		if m.ReplyTo == nil {
			t.Fatal("the reply lost its quote when the original was withdrawn")
		}
		if m.ReplyTo.Body != "" {
			t.Fatalf("a withdrawn message's text is still readable in a quote: %q", m.ReplyTo.Body)
		}
		if !m.ReplyTo.IsDeleted {
			t.Fatal("the quote does not report the original as deleted")
		}
	}
	if !found {
		t.Fatal("the reply itself disappeared with the message it answered")
	}
}

// --- bulk delete -----------------------------------------------------------

func TestBulkDeleteForEveryone(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, buyerToken := h.thread(t)

	ids := make([]string, 0, 5)
	for _, body := range []string{"bir", "ikki", "uch", "to'rt", "besh"} {
		ids = append(ids, h.sayReplying(t, id, buyerToken, body, "").ID.String())
	}

	if code := h.deleteMany(t, buyerToken, "everyone", ids...); code != http.StatusOK {
		t.Fatalf("bulk delete got status %d", code)
	}

	// Both sides see five withdrawn messages, and none of their text.
	for _, side := range []struct {
		name  string
		token string
	}{{"author", buyerToken}, {"other", ownerToken}} {
		deleted := 0
		for _, m := range h.messages(t, id, side.token) {
			if m.IsDeleted {
				deleted++
				if m.Body != "" {
					t.Fatalf("%s: withdrawn message still carries text", side.name)
				}
			}
		}
		if deleted != len(ids) {
			t.Fatalf("%s sees %d withdrawn messages, want %d", side.name, deleted, len(ids))
		}
	}
}

func TestBulkDeleteForMeIsOnePersonsView(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, buyerToken := h.thread(t)

	ids := []string{
		h.sayReplying(t, id, buyerToken, "bir", "").ID.String(),
		h.sayReplying(t, id, ownerToken, "ikki", "").ID.String(),
		h.sayReplying(t, id, buyerToken, "uch", "").ID.String(),
	}

	// "For me" covers the other person's messages too — hiding is not authorship.
	if code := h.deleteMany(t, buyerToken, "me", ids...); code != http.StatusOK {
		t.Fatalf("bulk hide got status %d", code)
	}

	for _, m := range h.messages(t, id, buyerToken) {
		for _, hidden := range ids {
			if m.ID.String() == hidden {
				t.Fatal("a message hidden for this reader is still in their thread")
			}
		}
	}
	if len(h.messages(t, id, ownerToken)) != len(ids) {
		t.Fatal("one person's hide changed the other person's thread")
	}
}

// The rule the single-message endpoint enforces, enforced for a selection: a
// batch is not a way around authorship.
func TestBulkDeleteForEveryoneRefusesOtherPeoplesMessages(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, buyerToken := h.thread(t)

	mine := h.sayReplying(t, id, buyerToken, "meniki", "").ID.String()
	theirs := h.sayReplying(t, id, ownerToken, "boshqasi", "").ID.String()

	code := h.deleteMany(t, buyerToken, "everyone", mine, theirs)
	if code == http.StatusOK {
		t.Fatal("a selection containing someone else's message was withdrawn for everyone")
	}

	// Refused whole: the caller's own message is untouched too, so the outcome
	// is not half-applied.
	for _, m := range h.messages(t, id, buyerToken) {
		if m.ID.String() == mine && m.IsDeleted {
			t.Fatal("the refused selection still withdrew part of itself")
		}
	}
}

// A selection is not a way to reach into a thread you are not in.
func TestBulkDeleteRefusesMessagesFromAnotherThread(t *testing.T) {
	h := newChatHarness(t)
	first, _, firstBuyer := h.thread(t)
	second, _, secondBuyer := h.thread(t)

	outsider := h.sayReplying(t, first, firstBuyer, "boshqa suhbat", "").ID.String()
	own := h.sayReplying(t, second, secondBuyer, "o'zimniki", "").ID.String()

	if code := h.deleteMany(t, secondBuyer, "me", own, outsider); code == http.StatusOK {
		t.Fatal("a message from another thread was accepted into a selection")
	}
}
