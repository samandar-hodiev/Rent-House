//go:build integration

// Pin, archive and delete, end to end against PostgreSQL.
//
// The question underneath most of these is the same one: does one person's
// opinion about a thread reach the other person's copy? It must not, and the
// schema is what stops it — these tests are the check that the schema is
// actually being used that way.
package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/realtime"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
)

type chatHarness struct {
	*listingHarness
	hub *realtime.Hub
}

func newChatHarness(t *testing.T) *chatHarness {
	t.Helper()
	h := newListingHarness(t)

	hub := realtime.NewHub()
	chatService := service.NewChatService(
		repository.NewChatRepository(h.db),
		repository.NewApartmentRepository(h.db),
		repository.NewUserRepository(h.db),
		hub,
		nil,
		func(id uuid.UUID) string { return "http://test/attachments/" + id.String() },
	)
	chatHandler := NewChatHandler(chatService)

	v1 := h.router.Group("/api/v1")
	conversations := v1.Group("/conversations", middleware.Auth(h.tokens))
	conversations.POST("", chatHandler.StartConversation)
	conversations.GET("", chatHandler.ListConversations)
	conversations.GET("/unread", chatHandler.UnreadTotal)
	conversations.GET("/:id", chatHandler.GetConversation)
	conversations.GET("/:id/messages", chatHandler.ListMessages)
	conversations.POST("/:id/messages", chatHandler.SendMessage)
	conversations.POST("/:id/read", chatHandler.MarkRead)
	conversations.PATCH("/:id/pin", chatHandler.SetPinned)
	conversations.PATCH("/:id/archive", chatHandler.SetArchived)
	conversations.DELETE("/:id", chatHandler.DeleteConversation)

	return &chatHarness{listingHarness: h, hub: hub}
}

// --- helpers ---------------------------------------------------------------

// thread publishes a listing as the owner and opens a conversation on it as the
// buyer, returning the conversation id and both tokens.
func (h *chatHarness) thread(t *testing.T) (conversationID, ownerToken, buyerToken string) {
	t.Helper()
	ownerToken, _ = h.signUp(t)
	buyerToken, _ = h.signUp(t)
	apartmentID := h.publish(t, ownerToken)

	rec := h.do(t, http.MethodPost, "/api/v1/conversations",
		map[string]any{"apartment_id": apartmentID}, buyerToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("start conversation got status %d: %s", rec.Code, rec.Body.String())
	}
	var conversation dto.ConversationResponse
	if err := json.Unmarshal(decode(t, rec).Data, &conversation); err != nil {
		t.Fatalf("decode conversation: %v", err)
	}
	return conversation.ID.String(), ownerToken, buyerToken
}

func (h *chatHarness) list(t *testing.T, token string, archived bool) []dto.ConversationResponse {
	t.Helper()
	path := "/api/v1/conversations"
	if archived {
		path += "?archived=true"
	}
	rec := h.do(t, http.MethodGet, path, nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("list got status %d: %s", rec.Code, rec.Body.String())
	}
	var out dto.ConversationListResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	return out.Items
}

func (h *chatHarness) find(
	t *testing.T, token, conversationID string, archived bool,
) *dto.ConversationResponse {
	t.Helper()
	for _, item := range h.list(t, token, archived) {
		if item.ID.String() == conversationID {
			return &item
		}
	}
	return nil
}

func (h *chatHarness) say(t *testing.T, conversationID, token, body string) {
	t.Helper()
	rec := h.do(t, http.MethodPost, "/api/v1/conversations/"+conversationID+"/messages",
		map[string]any{"body": body}, token)
	if rec.Code != http.StatusCreated && rec.Code != http.StatusOK {
		t.Fatalf("send got status %d: %s", rec.Code, rec.Body.String())
	}
}

// --- pin -------------------------------------------------------------------

func TestPinIsOnePersonsOpinion(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, buyerToken := h.thread(t)

	rec := h.do(t, http.MethodPatch, "/api/v1/conversations/"+id+"/pin",
		map[string]any{"value": true}, buyerToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("pin got status %d: %s", rec.Code, rec.Body.String())
	}

	if mine := h.find(t, buyerToken, id, false); mine == nil || !mine.IsPinned {
		t.Error("the person who pinned it does not see it pinned")
	}
	// The whole point: the other side's row was not touched.
	if theirs := h.find(t, ownerToken, id, false); theirs == nil || theirs.IsPinned {
		t.Error("pinning reached the other participant's copy")
	}

	// And it comes back off.
	h.do(t, http.MethodPatch, "/api/v1/conversations/"+id+"/pin",
		map[string]any{"value": false}, buyerToken)
	if mine := h.find(t, buyerToken, id, false); mine == nil || mine.IsPinned {
		t.Error("unpinning did not take")
	}
}

func TestPinnedThreadsSortFirst(t *testing.T) {
	h := newChatHarness(t)
	buyerToken, _ := h.signUp(t)

	// Three threads, opened oldest first, so without pinning the newest leads.
	ids := make([]string, 0, 3)
	for i := 0; i < 3; i++ {
		ownerToken, _ := h.signUp(t)
		apartmentID := h.publish(t, ownerToken)
		rec := h.do(t, http.MethodPost, "/api/v1/conversations",
			map[string]any{"apartment_id": apartmentID}, buyerToken)
		var conversation dto.ConversationResponse
		if err := json.Unmarshal(decode(t, rec).Data, &conversation); err != nil {
			t.Fatalf("decode: %v", err)
		}
		ids = append(ids, conversation.ID.String())
	}

	// Pin the oldest, which is last without a pin.
	h.do(t, http.MethodPatch, "/api/v1/conversations/"+ids[0]+"/pin",
		map[string]any{"value": true}, buyerToken)

	items := h.list(t, buyerToken, false)
	if len(items) != 3 {
		t.Fatalf("expected 3 threads, got %d", len(items))
	}
	if items[0].ID.String() != ids[0] {
		t.Errorf("the pinned thread is at position %d, not the top", indexOf(items, ids[0]))
	}
}

func indexOf(items []dto.ConversationResponse, id string) int {
	for i, item := range items {
		if item.ID.String() == id {
			return i
		}
	}
	return -1
}

// --- archive ---------------------------------------------------------------

func TestArchiveMovesOnlyOnePersonsCopy(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, buyerToken := h.thread(t)
	h.say(t, id, buyerToken, "Salom, uy bo'shmi?")

	rec := h.do(t, http.MethodPatch, "/api/v1/conversations/"+id+"/archive",
		map[string]any{"value": true}, buyerToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("archive got status %d: %s", rec.Code, rec.Body.String())
	}

	if h.find(t, buyerToken, id, false) != nil {
		t.Error("an archived thread is still in its owner's main list")
	}
	archived := h.find(t, buyerToken, id, true)
	if archived == nil || !archived.IsArchived {
		t.Fatal("the archived thread is not in the archive")
	}
	// The history is intact — archiving is not deletion.
	if archived.LastMessage == nil || archived.LastMessage.Body != "Salom, uy bo'shmi?" {
		t.Errorf("archiving lost the messages: %+v", archived.LastMessage)
	}
	// And the other side never noticed.
	if theirs := h.find(t, ownerToken, id, false); theirs == nil || theirs.IsArchived {
		t.Error("archiving reached the other participant")
	}

	// Reversible.
	h.do(t, http.MethodPatch, "/api/v1/conversations/"+id+"/archive",
		map[string]any{"value": false}, buyerToken)
	if h.find(t, buyerToken, id, false) == nil {
		t.Error("un-archiving did not bring the thread back")
	}
}

// --- delete for me ---------------------------------------------------------

func TestDeleteForMeLeavesTheOtherSideWhole(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, buyerToken := h.thread(t)
	h.say(t, id, buyerToken, "Birinchi xabar")

	rec := h.do(t, http.MethodDelete, "/api/v1/conversations/"+id,
		map[string]any{"for_everyone": false}, buyerToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete got status %d: %s", rec.Code, rec.Body.String())
	}

	if h.find(t, buyerToken, id, false) != nil {
		t.Error("the thread is still listed for the person who deleted it")
	}
	theirs := h.find(t, ownerToken, id, false)
	if theirs == nil {
		t.Fatal("deleting for me removed the thread from the other participant too")
	}
	if theirs.LastMessage == nil || theirs.LastMessage.Body != "Birinchi xabar" {
		t.Error("the other participant lost the message history")
	}
}

func TestANewMessageRevivesADeletedThreadWithoutItsHistory(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, buyerToken := h.thread(t)
	h.say(t, id, buyerToken, "Eski xabar")

	h.do(t, http.MethodDelete, "/api/v1/conversations/"+id,
		map[string]any{"for_everyone": false}, buyerToken)
	if h.find(t, buyerToken, id, false) != nil {
		t.Fatal("the thread did not go away")
	}

	// The other side writes again. The thread has to come back — otherwise the
	// message lands somewhere its recipient cannot reach.
	h.say(t, id, ownerToken, "Yangi xabar")

	revived := h.find(t, buyerToken, id, false)
	if revived == nil {
		t.Fatal("a new message did not bring the thread back")
	}
	if revived.LastMessage == nil || revived.LastMessage.Body != "Yangi xabar" {
		t.Errorf("the revived thread shows %+v", revived.LastMessage)
	}

	// It comes back carrying only what arrived after the deletion.
	rec := h.do(t, http.MethodGet, "/api/v1/conversations/"+id+"/messages?limit=50", nil, buyerToken)
	var page dto.MessagePageResponse
	if err := json.Unmarshal(decode(t, rec).Data, &page); err != nil {
		t.Fatalf("decode messages: %v", err)
	}
	for _, message := range page.Items {
		if message.Body == "Eski xabar" {
			t.Error("a message from before the deletion came back with the thread")
		}
	}

	// The other participant still has all of it.
	rec = h.do(t, http.MethodGet, "/api/v1/conversations/"+id+"/messages?limit=50", nil, ownerToken)
	var theirs dto.MessagePageResponse
	if err := json.Unmarshal(decode(t, rec).Data, &theirs); err != nil {
		t.Fatalf("decode messages: %v", err)
	}
	if len(theirs.Items) != 2 {
		t.Errorf("the other participant has %d messages, want both", len(theirs.Items))
	}
}

// --- delete for everyone ---------------------------------------------------

func TestDeleteForEveryoneRemovesItFromBoth(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, buyerToken := h.thread(t)
	h.say(t, id, buyerToken, "Xabar")

	rec := h.do(t, http.MethodDelete, "/api/v1/conversations/"+id,
		map[string]any{"for_everyone": true}, buyerToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete got status %d: %s", rec.Code, rec.Body.String())
	}

	for _, who := range []struct {
		name  string
		token string
	}{{"the deleter", buyerToken}, {"the other participant", ownerToken}} {
		if h.find(t, who.token, id, false) != nil || h.find(t, who.token, id, true) != nil {
			t.Errorf("%s can still list the thread", who.name)
		}
		// Not reachable by id either — the removal is enforced on every read,
		// not left to the client to respect.
		if rec := h.do(t, http.MethodGet, "/api/v1/conversations/"+id, nil, who.token); rec.Code != http.StatusNotFound {
			t.Errorf("%s got status %d opening it by id, want 404", who.name, rec.Code)
		}
		if rec := h.do(t, http.MethodGet, "/api/v1/conversations/"+id+"/messages", nil, who.token); rec.Code != http.StatusNotFound {
			t.Errorf("%s could still read the messages (status %d)", who.name, rec.Code)
		}
		// And cannot be written into.
		if rec := h.do(t, http.MethodPost, "/api/v1/conversations/"+id+"/messages",
			map[string]any{"body": "hali ham shu yerda"}, who.token); rec.Code != http.StatusNotFound {
			t.Errorf("%s could still send into it (status %d)", who.name, rec.Code)
		}
	}
}

func TestDeletedThreadsLeaveTheUnreadBadge(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, buyerToken := h.thread(t)
	h.say(t, id, buyerToken, "O'qilmagan xabar")

	if total := h.unread(t, ownerToken); total != 1 {
		t.Fatalf("unread is %d before the delete, want 1", total)
	}

	// The recipient hides the thread: what was in it stops waiting to be read.
	h.do(t, http.MethodDelete, "/api/v1/conversations/"+id,
		map[string]any{"for_everyone": false}, ownerToken)

	if total := h.unread(t, ownerToken); total != 0 {
		t.Errorf("unread is %d after deleting the thread, want 0", total)
	}
}

func (h *chatHarness) unread(t *testing.T, token string) int64 {
	t.Helper()
	rec := h.do(t, http.MethodGet, "/api/v1/conversations/unread", nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("unread got status %d", rec.Code)
	}
	var out struct {
		UnreadTotal int64 `json:"unread_total"`
	}
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode unread: %v", err)
	}
	return out.UnreadTotal
}

// --- authorization ---------------------------------------------------------

func TestAStrangerCannotTouchAThread(t *testing.T) {
	h := newChatHarness(t)
	id, _, _ := h.thread(t)
	strangerToken, _ := h.signUp(t)

	// Indistinguishable from a thread that does not exist: telling a stranger
	// it is there is itself a leak.
	for _, call := range []struct {
		method string
		path   string
		body   any
	}{
		{http.MethodPatch, "/api/v1/conversations/" + id + "/pin", map[string]any{"value": true}},
		{http.MethodPatch, "/api/v1/conversations/" + id + "/archive", map[string]any{"value": true}},
		{http.MethodDelete, "/api/v1/conversations/" + id, map[string]any{"for_everyone": true}},
		{http.MethodDelete, "/api/v1/conversations/" + id, map[string]any{"for_everyone": false}},
	} {
		rec := h.do(t, call.method, call.path, call.body, strangerToken)
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s %s by a stranger got status %d, want 404", call.method, call.path, rec.Code)
		}
	}

	// Nothing was changed by any of those attempts.
	if rec := h.do(t, http.MethodGet, "/api/v1/conversations", nil, strangerToken); rec.Code == http.StatusOK {
		var out dto.ConversationListResponse
		_ = json.Unmarshal(decode(t, rec).Data, &out)
		if len(out.Items) != 0 {
			t.Errorf("the stranger's list has %d threads in it", len(out.Items))
		}
	}
}

func TestConversationStateRoutesNeedAToken(t *testing.T) {
	h := newChatHarness(t)
	id, _, _ := h.thread(t)

	for _, call := range []struct {
		method string
		path   string
	}{
		{http.MethodPatch, "/api/v1/conversations/" + id + "/pin"},
		{http.MethodPatch, "/api/v1/conversations/" + id + "/archive"},
		{http.MethodDelete, "/api/v1/conversations/" + id},
	} {
		rec := h.do(t, call.method, call.path, map[string]any{"value": true}, "")
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s without a token got %d, want 401", call.method, call.path, rec.Code)
		}
	}
}

// A withdrawn thread must not lock the two people out of the listing forever.
//
// UNIQUE (apartment_id, buyer_id) means there can only ever be one row for a
// pair and a listing, so "delete for everyone" without this would leave the
// button returning a thread neither of them is allowed to open.
func TestAWithdrawnThreadCanBeStartedAgain(t *testing.T) {
	h := newChatHarness(t)
	ownerToken, _ := h.signUp(t)
	buyerToken, _ := h.signUp(t)
	apartmentID := h.publish(t, ownerToken)

	start := func() string {
		t.Helper()
		rec := h.do(t, http.MethodPost, "/api/v1/conversations",
			map[string]any{"apartment_id": apartmentID}, buyerToken)
		if rec.Code != http.StatusOK {
			t.Fatalf("start conversation got status %d: %s", rec.Code, rec.Body.String())
		}
		var conversation dto.ConversationResponse
		if err := json.Unmarshal(decode(t, rec).Data, &conversation); err != nil {
			t.Fatalf("decode: %v", err)
		}
		return conversation.ID.String()
	}

	id := start()
	h.say(t, id, buyerToken, "Birinchi urinish")
	h.do(t, http.MethodDelete, "/api/v1/conversations/"+id,
		map[string]any{"for_everyone": true}, buyerToken)

	// Asking again works, and gives a thread both of them can use.
	again := start()
	if h.find(t, buyerToken, again, false) == nil {
		t.Fatal("the reopened thread is not in the buyer's list")
	}
	if h.find(t, ownerToken, again, false) == nil {
		t.Fatal("the reopened thread is not in the owner's list")
	}

	// And it starts empty: what was withdrawn stays withdrawn.
	rec := h.do(t, http.MethodGet, "/api/v1/conversations/"+again+"/messages?limit=50", nil, buyerToken)
	var page dto.MessagePageResponse
	if err := json.Unmarshal(decode(t, rec).Data, &page); err != nil {
		t.Fatalf("decode messages: %v", err)
	}
	if len(page.Items) != 0 {
		t.Errorf("the reopened thread carries %d old messages", len(page.Items))
	}

	h.say(t, again, buyerToken, "Ikkinchi urinish")
	if got := h.find(t, ownerToken, again, false); got == nil ||
		got.LastMessage == nil || got.LastMessage.Body != "Ikkinchi urinish" {
		t.Error("the owner cannot see a message sent in the reopened thread")
	}
}

// --- one conversation per pair ---------------------------------------------

// The rule this whole model exists for: two people have one conversation,
// however many listings they write about.
func TestOneConversationPerPairAcrossListings(t *testing.T) {
	h := newChatHarness(t)
	ownerToken, _ := h.signUp(t)
	buyerToken, _ := h.signUp(t)

	// One seller, three listings.
	listings := make([]string, 0, 3)
	for i := 0; i < 3; i++ {
		listings = append(listings, h.publish(t, ownerToken))
	}

	ids := map[string]bool{}
	for i, apartmentID := range listings {
		rec := h.do(t, http.MethodPost, "/api/v1/conversations",
			map[string]any{"apartment_id": apartmentID}, buyerToken)
		if rec.Code != http.StatusOK {
			t.Fatalf("listing %d: start got status %d: %s", i, rec.Code, rec.Body.String())
		}
		var conversation dto.ConversationResponse
		if err := json.Unmarshal(decode(t, rec).Data, &conversation); err != nil {
			t.Fatalf("decode: %v", err)
		}
		ids[conversation.ID.String()] = true

		// Each message carries the listing it was written from.
		h.sayAbout(t, conversation.ID.String(), buyerToken,
			"Listing "+apartmentID[:8]+" haqida", apartmentID)
	}

	if len(ids) != 1 {
		t.Errorf("three listings produced %d conversations, want 1", len(ids))
	}

	// The sidebar agrees, for both people.
	for _, who := range []struct {
		name  string
		token string
	}{{"buyer", buyerToken}, {"owner", ownerToken}} {
		items := h.list(t, who.token, false)
		if len(items) != 1 {
			t.Errorf("%s sees %d conversations, want 1", who.name, len(items))
		}
	}

	// And all three messages are inside it, each with its own context.
	conversationID := h.list(t, buyerToken, false)[0].ID.String()
	rec := h.do(t, http.MethodGet,
		"/api/v1/conversations/"+conversationID+"/messages?limit=50", nil, buyerToken)
	var page dto.MessagePageResponse
	if err := json.Unmarshal(decode(t, rec).Data, &page); err != nil {
		t.Fatalf("decode messages: %v", err)
	}
	if len(page.Items) != 3 {
		t.Fatalf("the conversation holds %d messages, want all 3", len(page.Items))
	}

	contexts := map[string]bool{}
	for _, message := range page.Items {
		if message.ApartmentID == nil {
			t.Errorf("message %q lost its listing context", message.Body)
			continue
		}
		contexts[message.ApartmentID.String()] = true
	}
	if len(contexts) != 3 {
		t.Errorf("the messages name %d distinct listings, want 3", len(contexts))
	}
	for _, apartmentID := range listings {
		if !contexts[apartmentID] {
			t.Errorf("no message is about listing %s", apartmentID)
		}
	}
}

// The thread's pinned context follows the listing most recently written about.
func TestTheThreadContextFollowsTheLatestListing(t *testing.T) {
	h := newChatHarness(t)
	ownerToken, _ := h.signUp(t)
	buyerToken, _ := h.signUp(t)

	first := h.publish(t, ownerToken)
	second := h.publish(t, ownerToken)

	id := h.startAbout(t, buyerToken, first)
	h.sayAbout(t, id, buyerToken, "Birinchi uy haqida", first)
	if got := h.find(t, buyerToken, id, false); got == nil ||
		got.Apartment == nil || got.Apartment.ID.String() != first {
		t.Errorf("the context is %v, want the first listing", got.Apartment)
	}

	// Writing about the second one moves the pin, and does not fork the thread.
	again := h.startAbout(t, buyerToken, second)
	if again != id {
		t.Fatalf("a second listing produced a different conversation (%s vs %s)", again, id)
	}
	h.sayAbout(t, id, buyerToken, "Ikkinchi uy haqida", second)

	got := h.find(t, buyerToken, id, false)
	if got == nil || got.Apartment == nil || got.Apartment.ID.String() != second {
		t.Errorf("the context did not follow the newer listing: %v", got.Apartment)
	}
	// Both sides see the same one thread.
	if items := h.list(t, ownerToken, false); len(items) != 1 {
		t.Errorf("the owner sees %d conversations, want 1", len(items))
	}
}

// A withdrawn listing must not take the conversation with it.
func TestAConversationOutlivesItsListing(t *testing.T) {
	h := newChatHarness(t)
	ownerToken, _ := h.signUp(t)
	buyerToken, _ := h.signUp(t)

	apartmentID := h.publish(t, ownerToken)
	id := h.startAbout(t, buyerToken, apartmentID)
	h.sayAbout(t, id, buyerToken, "Bu uy bo'shmi?", apartmentID)

	if rec := h.do(t, http.MethodDelete, "/api/v1/apartments/"+apartmentID, nil, ownerToken); rec.Code != http.StatusOK {
		t.Fatalf("delete listing got status %d: %s", rec.Code, rec.Body.String())
	}

	got := h.find(t, buyerToken, id, false)
	if got == nil {
		t.Fatal("deleting the listing destroyed the conversation")
	}
	if got.Apartment != nil {
		t.Errorf("the thread still points at the withdrawn listing: %v", got.Apartment)
	}
	if got.LastMessage == nil || got.LastMessage.Body != "Bu uy bo'shmi?" {
		t.Error("the messages were lost with the listing")
	}
}

// Reopening a withdrawn thread must not destroy the pair's correspondence.
func TestReopeningHidesHistoryWithoutDestroyingIt(t *testing.T) {
	h := newChatHarness(t)
	ownerToken, _ := h.signUp(t)
	buyerToken, _ := h.signUp(t)
	apartmentID := h.publish(t, ownerToken)

	id := h.startAbout(t, buyerToken, apartmentID)
	h.sayAbout(t, id, buyerToken, "Eski yozishma", apartmentID)

	h.do(t, http.MethodDelete, "/api/v1/conversations/"+id,
		map[string]any{"for_everyone": true}, buyerToken)

	// Reopened by asking again.
	again := h.startAbout(t, buyerToken, apartmentID)
	if again != id {
		t.Fatalf("reopening produced a different conversation")
	}

	// Neither participant is served the old messages...
	for _, who := range []struct {
		name  string
		token string
	}{{"buyer", buyerToken}, {"owner", ownerToken}} {
		rec := h.do(t, http.MethodGet,
			"/api/v1/conversations/"+id+"/messages?limit=50", nil, who.token)
		var page dto.MessagePageResponse
		if err := json.Unmarshal(decode(t, rec).Data, &page); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if len(page.Items) != 0 {
			t.Errorf("%s was served %d messages from before the withdrawal", who.name, len(page.Items))
		}
	}

	// ...but they are still on the row. This is the difference from the
	// previous behaviour, which deleted them outright — and which, now that a
	// conversation is a pair's whole correspondence, would have destroyed
	// every message they had ever exchanged.
	var stored int64
	if err := h.db.Table("messages").Where("conversation_id = ?", id).Count(&stored).Error; err != nil {
		t.Fatalf("count messages: %v", err)
	}
	if stored != 1 {
		t.Errorf("%d messages survive on the row, want the 1 that was hidden", stored)
	}
}

// startAbout opens the pair's thread from a listing and returns its id.
func (h *chatHarness) startAbout(t *testing.T, token, apartmentID string) string {
	t.Helper()
	rec := h.do(t, http.MethodPost, "/api/v1/conversations",
		map[string]any{"apartment_id": apartmentID}, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("start got status %d: %s", rec.Code, rec.Body.String())
	}
	var conversation dto.ConversationResponse
	if err := json.Unmarshal(decode(t, rec).Data, &conversation); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return conversation.ID.String()
}

// sayAbout sends a message naming the listing it is about.
func (h *chatHarness) sayAbout(t *testing.T, conversationID, token, body, apartmentID string) {
	t.Helper()
	rec := h.do(t, http.MethodPost, "/api/v1/conversations/"+conversationID+"/messages",
		map[string]any{"body": body, "apartment_id": apartmentID}, token)
	if rec.Code != http.StatusCreated && rec.Code != http.StatusOK {
		t.Fatalf("send got status %d: %s", rec.Code, rec.Body.String())
	}
}
