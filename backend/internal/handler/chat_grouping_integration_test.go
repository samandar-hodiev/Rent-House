//go:build integration

// One conversation per pair of people, end to end against PostgreSQL.
//
// A conversation belongs to two people; a listing is what a message is *about*.
// Getting that wrong is not subtle from the outside — the same person appears
// in the chat list once per listing they were ever asked about — so these tests
// assert the visible symptom as well as the row count underneath it.
package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
)

// --- helpers ---------------------------------------------------------------

// start opens (or reopens) the thread about a listing and returns it.
func (h *chatHarness) start(t *testing.T, token, apartmentID string) dto.ConversationResponse {
	t.Helper()
	rec := h.do(t, http.MethodPost, "/api/v1/conversations",
		map[string]any{"apartment_id": apartmentID}, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("start conversation got status %d: %s", rec.Code, rec.Body.String())
	}
	var conversation dto.ConversationResponse
	if err := json.Unmarshal(decode(t, rec).Data, &conversation); err != nil {
		t.Fatalf("decode conversation: %v", err)
	}
	return conversation
}

// `sayAbout` — sending a message tagged with the listing it is about — already
// exists on the harness in conversation_state_integration_test.go.

func (h *chatHarness) page(t *testing.T, conversationID, token string) dto.MessagePageResponse {
	t.Helper()
	rec := h.do(t, http.MethodGet,
		"/api/v1/conversations/"+conversationID+"/messages?limit=100", nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("list messages got status %d: %s", rec.Code, rec.Body.String())
	}
	var out dto.MessagePageResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode messages: %v", err)
	}
	return out
}

func (h *chatHarness) messages(t *testing.T, conversationID, token string) []dto.MessageResponse {
	t.Helper()
	return h.page(t, conversationID, token).Items
}

// --- grouping --------------------------------------------------------------

// The scenario from the bug report: one owner, five listings, one enquirer who
// writes about every one of them.
func TestFiveListingsOneConversation(t *testing.T) {
	h := newChatHarness(t)
	ownerToken, _ := h.signUp(t)
	buyerToken, _ := h.signUp(t)

	apartments := make([]string, 5)
	for i := range apartments {
		apartments[i] = h.publish(t, ownerToken)
	}

	var first uuid.UUID
	for i, apartmentID := range apartments {
		conversation := h.start(t, buyerToken, apartmentID)
		if i == 0 {
			first = conversation.ID
		} else if conversation.ID != first {
			t.Fatalf("listing %d opened a second conversation: %s != %s",
				i+1, conversation.ID, first)
		}
		h.sayAbout(t, conversation.ID.String(), buyerToken, "Salom", apartmentID)
	}

	// The symptom the report described: the same person, five times over.
	for _, side := range []struct {
		name  string
		token string
	}{{"buyer", buyerToken}, {"owner", ownerToken}} {
		items := h.list(t, side.token, false)
		if len(items) != 1 {
			t.Fatalf("%s sees %d conversations, want 1", side.name, len(items))
		}
		seen := map[uuid.UUID]int{}
		for _, item := range items {
			seen[item.Other.ID]++
		}
		for id, count := range seen {
			if count > 1 {
				t.Fatalf("%s sees user %s %d times in the chat list", side.name, id, count)
			}
		}
	}

	// Nothing was traded away for the single thread: every message is in it,
	// and every message still knows which listing it was about.
	msgs := h.messages(t, first.String(), buyerToken)
	if len(msgs) != len(apartments) {
		t.Fatalf("conversation holds %d messages, want %d", len(msgs), len(apartments))
	}
	got := map[string]bool{}
	for _, m := range msgs {
		if m.ApartmentID == nil {
			t.Fatalf("message %s lost its listing context", m.ID)
		}
		got[m.ApartmentID.String()] = true
	}
	if len(got) != len(apartments) {
		t.Fatalf("messages name %d distinct listings, want %d", len(got), len(apartments))
	}
	for _, apartmentID := range apartments {
		if !got[apartmentID] {
			t.Fatalf("no message carries listing %s", apartmentID)
		}
	}
}

// The case ordered columns cannot express. Whoever enquires is recorded as the
// "buyer", so when the other person asks about one of *their* listings the two
// roles swap — and it is still the same two people, so it is still one thread.
func TestRoleSwapReusesTheSameConversation(t *testing.T) {
	h := newChatHarness(t)
	alisherToken, alisherID := h.signUp(t)
	samandarToken, samandarID := h.signUp(t)

	samandarListing := h.publish(t, samandarToken)
	alisherListing := h.publish(t, alisherToken)

	// Alisher enquires about Samandar's listing: Alisher is the buyer.
	first := h.start(t, alisherToken, samandarListing)
	h.sayAbout(t, first.ID.String(), alisherToken, "Assalomu alaykum", samandarListing)

	// Samandar enquires about Alisher's listing: the roles are now reversed.
	second := h.start(t, samandarToken, alisherListing)
	if second.ID != first.ID {
		t.Fatalf("role swap opened a second conversation: %s != %s", second.ID, first.ID)
	}
	h.sayAbout(t, second.ID.String(), samandarToken, "Bu uy hali bo'shmi?", alisherListing)

	for _, side := range []struct {
		name  string
		token string
		other string
	}{
		{"alisher", alisherToken, samandarID},
		{"samandar", samandarToken, alisherID},
	} {
		items := h.list(t, side.token, false)
		if len(items) != 1 {
			t.Fatalf("%s sees %d conversations, want 1", side.name, len(items))
		}
		if items[0].Other.ID.String() != side.other {
			t.Fatalf("%s sees the wrong person: %s", side.name, items[0].Other.ID)
		}
	}

	// Both halves of the correspondence are in the one thread, each still
	// naming the listing it was about.
	msgs := h.messages(t, first.ID.String(), alisherToken)
	if len(msgs) != 2 {
		t.Fatalf("merged thread holds %d messages, want 2", len(msgs))
	}
	named := map[string]bool{}
	for _, m := range msgs {
		if m.ApartmentID == nil {
			t.Fatalf("message %s lost its listing context", m.ID)
		}
		named[m.ApartmentID.String()] = true
	}
	if !named[samandarListing] || !named[alisherListing] {
		t.Fatalf("thread does not carry both listings: %v", named)
	}
}

// Grouping must not over-reach: different people are different threads.
func TestDifferentPeopleStayDifferentConversations(t *testing.T) {
	h := newChatHarness(t)

	t.Run("one buyer, several sellers", func(t *testing.T) {
		buyerToken, _ := h.signUp(t)
		ids := map[uuid.UUID]bool{}
		for i := 0; i < 3; i++ {
			sellerToken, _ := h.signUp(t)
			conversation := h.start(t, buyerToken, h.publish(t, sellerToken))
			ids[conversation.ID] = true
		}
		if len(ids) != 3 {
			t.Fatalf("three sellers produced %d conversations, want 3", len(ids))
		}
		if items := h.list(t, buyerToken, false); len(items) != 3 {
			t.Fatalf("buyer sees %d conversations, want 3", len(items))
		}
	})

	t.Run("one seller, several buyers", func(t *testing.T) {
		sellerToken, _ := h.signUp(t)
		listing := h.publish(t, sellerToken)
		for i := 0; i < 3; i++ {
			buyerToken, _ := h.signUp(t)
			conversation := h.start(t, buyerToken, listing)
			h.sayAbout(t, conversation.ID.String(), buyerToken, "Salom", listing)
		}
		if items := h.list(t, sellerToken, false); len(items) != 3 {
			t.Fatalf("seller sees %d conversations, want 3", len(items))
		}
	})
}

// --- listing context -------------------------------------------------------

// Opening a chat from a listing page must pin that listing, not whichever one
// the pair happened to talk about last.
func TestContextFollowsTheListingChatWasStartedFrom(t *testing.T) {
	h := newChatHarness(t)
	ownerToken, _ := h.signUp(t)
	buyerToken, _ := h.signUp(t)

	apartments := make([]string, 5)
	for i := range apartments {
		apartments[i] = h.publish(t, ownerToken)
	}

	// Talk about the first, then arrive from the fifth.
	conversation := h.start(t, buyerToken, apartments[0])
	h.sayAbout(t, conversation.ID.String(), buyerToken, "Birinchi uy haqida", apartments[0])

	fifth := h.start(t, buyerToken, apartments[4])
	if fifth.Apartment == nil {
		t.Fatal("conversation has no pinned listing")
	}
	if fifth.Apartment.ID.String() != apartments[4] {
		t.Fatalf("pinned listing is %s, want the one chat was started from (%s)",
			fifth.Apartment.ID, apartments[4])
	}
	if fifth.Apartment.Title == "" {
		t.Fatal("pinned listing has no title to show in the header")
	}

	// And the owner's chat list shows the same context, so both sides agree
	// about what is being discussed.
	items := h.list(t, ownerToken, false)
	if len(items) != 1 {
		t.Fatalf("owner sees %d conversations, want 1", len(items))
	}
	if items[0].Apartment == nil || items[0].Apartment.ID.String() != apartments[4] {
		t.Fatalf("owner's list shows the wrong context: %+v", items[0].Apartment)
	}
}

// Sending about a different listing moves the pinned context and leaves the
// older messages pointing where they always did.
func TestContextMovesWithTheLatestMessage(t *testing.T) {
	h := newChatHarness(t)
	ownerToken, _ := h.signUp(t)
	buyerToken, _ := h.signUp(t)

	first := h.publish(t, ownerToken)
	second := h.publish(t, ownerToken)

	conversation := h.start(t, buyerToken, first)
	h.sayAbout(t, conversation.ID.String(), buyerToken, "Birinchi uy", first)
	h.sayAbout(t, conversation.ID.String(), buyerToken, "Ikkinchi uy", second)

	items := h.list(t, buyerToken, false)
	if len(items) != 1 {
		t.Fatalf("buyer sees %d conversations, want 1", len(items))
	}
	if items[0].Apartment == nil || items[0].Apartment.ID.String() != second {
		t.Fatalf("context did not follow the latest message: %+v", items[0].Apartment)
	}

	msgs := h.messages(t, conversation.ID.String(), buyerToken)
	if len(msgs) != 2 {
		t.Fatalf("thread holds %d messages, want 2", len(msgs))
	}
	if msgs[0].ApartmentID == nil || msgs[0].ApartmentID.String() != first {
		t.Fatalf("the earlier message no longer names the listing it was about")
	}
	if msgs[1].ApartmentID == nil || msgs[1].ApartmentID.String() != second {
		t.Fatalf("the later message does not name its listing")
	}
}

// The client heads each run of messages with the listing that run is about, so
// the page has to carry details for every listing the thread names — not only
// the one currently pinned, which is all the conversation itself reports.
func TestMessagePageCarriesEveryListingItNames(t *testing.T) {
	h := newChatHarness(t)
	ownerToken, _ := h.signUp(t)
	buyerToken, _ := h.signUp(t)

	first := h.publish(t, ownerToken)
	second := h.publish(t, ownerToken)
	third := h.publish(t, ownerToken)

	conversation := h.start(t, buyerToken, first)
	id := conversation.ID.String()
	h.sayAbout(t, id, buyerToken, "Birinchi uy", first)
	h.sayAbout(t, id, buyerToken, "Yana birinchi uy", first)
	h.sayAbout(t, id, buyerToken, "Ikkinchi uy", second)
	h.sayAbout(t, id, buyerToken, "Uchinchi uy", third)

	for _, side := range []struct {
		name  string
		token string
	}{{"buyer", buyerToken}, {"owner", ownerToken}} {
		page := h.page(t, id, side.token)

		byID := map[string]dto.ChatApartmentResponse{}
		for _, listing := range page.Apartments {
			byID[listing.ID.String()] = listing
		}
		if len(byID) != 3 {
			t.Fatalf("%s got %d listings, want 3", side.name, len(byID))
		}

		// Every message can be captioned from what the page carries, which is
		// the property the UI depends on.
		for _, m := range page.Items {
			if m.ApartmentID == nil {
				t.Fatalf("%s: message %s has no listing", side.name, m.ID)
			}
			listing, ok := byID[m.ApartmentID.String()]
			if !ok {
				t.Fatalf("%s: message %s names listing %s, absent from the page",
					side.name, m.ID, m.ApartmentID)
			}
			// A caption needs something to say.
			if listing.Title == "" {
				t.Fatalf("%s: listing %s came back without a title", side.name, listing.ID)
			}
			if listing.Price == "" {
				t.Fatalf("%s: listing %s came back without a price", side.name, listing.ID)
			}
			if listing.District == "" {
				t.Fatalf("%s: listing %s came back without a district", side.name, listing.ID)
			}
		}

		// The pinned context is only the latest; the page must exceed it.
		if conversation.Apartment != nil && len(byID) == 1 {
			t.Fatal("page carries only the pinned listing")
		}
	}
}

// --- the features grouping must not break ----------------------------------

// Archive, delete, block and unblock are per-person opinions about a thread.
// Merging threads into one changed what "a thread" is, so this re-checks that
// they still apply to one person's copy and survive a role swap.
func TestStateActionsSurviveRoleSwap(t *testing.T) {
	h := newChatHarness(t)
	alisherToken, _ := h.signUp(t)
	samandarToken, samandarID := h.signUp(t)

	conversation := h.start(t, alisherToken, h.publish(t, samandarToken))
	id := conversation.ID.String()
	h.sayAbout(t, id, alisherToken, "Salom", "")

	// Samandar arrives from his own side of the pair; still one thread.
	if swapped := h.start(t, samandarToken, h.publish(t, alisherToken)); swapped.ID != conversation.ID {
		t.Fatalf("role swap split the thread: %s != %s", swapped.ID, conversation.ID)
	}

	// Archive is one person's opinion.
	rec := h.do(t, http.MethodPatch, "/api/v1/conversations/"+id+"/archive",
		map[string]any{"value": true}, alisherToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("archive got status %d: %s", rec.Code, rec.Body.String())
	}
	if h.find(t, alisherToken, id, false) != nil {
		t.Fatal("archived thread is still in the archiver's main list")
	}
	if h.find(t, alisherToken, id, true) == nil {
		t.Fatal("archived thread is not in the archiver's archive")
	}
	if h.find(t, samandarToken, id, false) == nil {
		t.Fatal("one person's archive removed the thread from the other's list")
	}
	rec = h.do(t, http.MethodPatch, "/api/v1/conversations/"+id+"/archive",
		map[string]any{"value": false}, alisherToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("unarchive got status %d: %s", rec.Code, rec.Body.String())
	}

	// Block, then unblock, addressed at the person rather than the thread.
	rec = h.do(t, http.MethodPost, "/api/v1/me/blocks/"+samandarID,
		map[string]any{"reason": "spam"}, alisherToken)
	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("block got status %d: %s", rec.Code, rec.Body.String())
	}
	if item := h.find(t, alisherToken, id, false); item == nil || !item.IsBlocked {
		t.Fatal("thread does not report the block")
	}
	rec = h.do(t, http.MethodPost, "/api/v1/conversations/"+id+"/messages",
		map[string]any{"body": "o'tib ketadi?"}, samandarToken)
	if rec.Code == http.StatusCreated || rec.Code == http.StatusOK {
		t.Fatal("a blocked person could still send a message")
	}
	rec = h.do(t, http.MethodDelete, "/api/v1/me/blocks/"+samandarID, nil, alisherToken)
	if rec.Code != http.StatusOK && rec.Code != http.StatusNoContent {
		t.Fatalf("unblock got status %d: %s", rec.Code, rec.Body.String())
	}
	h.sayAbout(t, id, samandarToken, "endi o'tadi", "")

	// Delete is for the person who asked; the other keeps their copy.
	rec = h.do(t, http.MethodDelete, "/api/v1/conversations/"+id, nil, alisherToken)
	if rec.Code != http.StatusOK && rec.Code != http.StatusNoContent {
		t.Fatalf("delete got status %d: %s", rec.Code, rec.Body.String())
	}
	if h.find(t, alisherToken, id, false) != nil {
		t.Fatal("deleted thread is still in the deleter's list")
	}
	if h.find(t, samandarToken, id, false) == nil {
		t.Fatal("one person's delete removed the thread from the other's list")
	}
}
