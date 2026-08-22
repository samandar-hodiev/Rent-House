//go:build integration

// Blocking, end to end against PostgreSQL.
//
// The question most of these ask is the same one: does the refusal hold when
// the interface is bypassed? A disabled composer is a courtesy to the person
// using the app; the server is what makes it a rule.
package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
)

func (h *chatHarness) block(t *testing.T, token, targetID string, body any) int {
	t.Helper()
	return h.do(t, http.MethodPost, "/api/v1/me/blocks/"+targetID, body, token).Code
}

func (h *chatHarness) unblock(t *testing.T, token, targetID string) int {
	t.Helper()
	return h.do(t, http.MethodDelete, "/api/v1/me/blocks/"+targetID, nil, token).Code
}

func (h *chatHarness) blockState(t *testing.T, token, targetID string) dto.BlockStateResponse {
	t.Helper()
	rec := h.do(t, http.MethodGet, "/api/v1/me/blocks/"+targetID, nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("block state got status %d: %s", rec.Code, rec.Body.String())
	}
	var out dto.BlockStateResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode block state: %v", err)
	}
	return out
}

// pair opens a thread and returns everything the tests need to act as either
// side of it.
func (h *chatHarness) blockPair(t *testing.T) (
	conversationID, ownerToken, ownerID, buyerToken, buyerID string,
) {
	conversationID, ownerToken, ownerID, buyerToken, buyerID, _ = h.blockPairWithListing(t)
	return
}

// blockPairWithListing also hands back the listing, for tests that need to send
// messages carrying its context.
func (h *chatHarness) blockPairWithListing(t *testing.T) (
	conversationID, ownerToken, ownerID, buyerToken, buyerID, apartmentID string,
) {
	t.Helper()
	ownerToken, ownerID = h.signUp(t)
	buyerToken, buyerID = h.signUp(t)
	apartmentID = h.publish(t, ownerToken)

	rec := h.do(t, http.MethodPost, "/api/v1/conversations",
		map[string]any{"apartment_id": apartmentID}, buyerToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("start conversation got status %d: %s", rec.Code, rec.Body.String())
	}
	var conversation dto.ConversationResponse
	if err := json.Unmarshal(decode(t, rec).Data, &conversation); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return conversation.ID.String(), ownerToken, ownerID, buyerToken, buyerID, apartmentID
}

// trySend reports the status of a send attempt without failing the test.
func (h *chatHarness) trySend(t *testing.T, conversationID, token, body string) int {
	t.Helper()
	return h.do(t, http.MethodPost, "/api/v1/conversations/"+conversationID+"/messages",
		map[string]any{"body": body}, token).Code
}

func TestBlockingStopsMessagesBothWays(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, ownerID, buyerToken, buyerID := h.blockPair(t)

	// Both can write before the block.
	if code := h.trySend(t, id, buyerToken, "Oldin"); code != http.StatusCreated {
		t.Fatalf("the buyer could not write before the block: %d", code)
	}
	if code := h.trySend(t, id, ownerToken, "Javob"); code != http.StatusCreated {
		t.Fatalf("the owner could not write before the block: %d", code)
	}

	if code := h.block(t, buyerToken, ownerID, map[string]any{"reason": "spam"}); code != http.StatusOK {
		t.Fatalf("block got status %d", code)
	}

	// The person who blocked cannot write either — a one-way block would leave
	// them talking at someone unable to answer.
	if code := h.trySend(t, id, buyerToken, "Bloklagandan keyin"); code != http.StatusForbidden {
		t.Errorf("the blocker could still send (status %d)", code)
	}
	// And the blocked party certainly cannot.
	if code := h.trySend(t, id, ownerToken, "Menga javob bering"); code != http.StatusForbidden {
		t.Errorf("the blocked user could still send (status %d)", code)
	}

	// Each side is told what applies to them.
	if state := h.blockState(t, buyerToken, ownerID); !state.IsBlocked || state.IsBlockedBy {
		t.Errorf("the blocker's state is %+v", state)
	}
	if state := h.blockState(t, ownerToken, buyerID); state.IsBlocked || !state.IsBlockedBy {
		t.Errorf("the blocked user's state is %+v", state)
	}
}

func TestBlockingKeepsTheHistory(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, ownerID, buyerToken, _, apartmentID := h.blockPairWithListing(t)

	// Sent with the listing in view, so the test can check the context survives.
	h.sayAbout(t, id, buyerToken, "Birinchi xabar", apartmentID)
	h.sayAbout(t, id, ownerToken, "Ikkinchi xabar", apartmentID)

	h.block(t, buyerToken, ownerID, nil)

	// The thread is still listed, still readable, and still has its context.
	conversation := h.find(t, buyerToken, id, false)
	if conversation == nil {
		t.Fatal("blocking removed the conversation")
	}
	if !conversation.IsBlocked {
		t.Error("the conversation does not report the block")
	}
	if conversation.Apartment == nil {
		t.Error("blocking lost the listing context")
	}

	rec := h.do(t, http.MethodGet, "/api/v1/conversations/"+id+"/messages?limit=50", nil, buyerToken)
	var page dto.MessagePageResponse
	if err := json.Unmarshal(decode(t, rec).Data, &page); err != nil {
		t.Fatalf("decode messages: %v", err)
	}
	if len(page.Items) != 2 {
		t.Errorf("blocking left %d messages, want both", len(page.Items))
	}
	for _, message := range page.Items {
		if message.ApartmentID == nil {
			t.Errorf("message %q lost its apartment context", message.Body)
		}
	}
}

func TestUnblockingRestoresMessaging(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, ownerID, buyerToken, _ := h.blockPair(t)

	h.block(t, buyerToken, ownerID, map[string]any{"reason": "harassment"})
	if code := h.trySend(t, id, buyerToken, "Blokda"); code != http.StatusForbidden {
		t.Fatalf("the block did not take (status %d)", code)
	}

	if code := h.unblock(t, buyerToken, ownerID); code != http.StatusOK {
		t.Fatalf("unblock got status %d", code)
	}

	if code := h.trySend(t, id, buyerToken, "Blokdan keyin"); code != http.StatusCreated {
		t.Errorf("the blocker still cannot send after unblocking (status %d)", code)
	}
	if code := h.trySend(t, id, ownerToken, "Men ham"); code != http.StatusCreated {
		t.Errorf("the other side still cannot send after unblocking (status %d)", code)
	}
	if state := h.blockState(t, buyerToken, ownerID); state.IsBlocked || state.IsBlockedBy {
		t.Errorf("the block survived unblocking: %+v", state)
	}
}

func TestOnlyTheBlockerCanLiftTheirBlock(t *testing.T) {
	h := newChatHarness(t)
	id, ownerToken, ownerID, buyerToken, buyerID := h.blockPair(t)

	h.block(t, buyerToken, ownerID, nil)

	// The blocked user "unblocking" removes their own block on the buyer —
	// which does not exist — and leaves the buyer's block untouched. There is
	// no request shape that reaches somebody else's row.
	if code := h.unblock(t, ownerToken, buyerID); code != http.StatusOK {
		t.Fatalf("unblock got status %d", code)
	}
	if code := h.trySend(t, id, ownerToken, "Endi yozsam bo'ladimi"); code != http.StatusForbidden {
		t.Error("the blocked user lifted somebody else's block")
	}
	if state := h.blockState(t, buyerToken, ownerID); !state.IsBlocked {
		t.Error("the blocker's own block was removed by the other party")
	}
}

func TestBlockingTwiceIsOneBlock(t *testing.T) {
	h := newChatHarness(t)
	_, _, ownerID, buyerToken, _ := h.blockPair(t)

	for i := 0; i < 3; i++ {
		if code := h.block(t, buyerToken, ownerID, map[string]any{"reason": "spam"}); code != http.StatusOK {
			t.Fatalf("block %d got status %d", i, code)
		}
	}

	var count int64
	if err := h.db.Table("user_blocks").
		Where("blocker_id = (SELECT id FROM users WHERE id = blocker_id) AND blocked_id = ?", ownerID).
		Count(&count).Error; err != nil {
		t.Fatalf("count blocks: %v", err)
	}
	if count != 1 {
		t.Errorf("three block requests produced %d rows, want 1", count)
	}

	// A second block restates the reason rather than adding a row.
	if code := h.block(t, buyerToken, ownerID, map[string]any{"reason": "abuse"}); code != http.StatusOK {
		t.Fatalf("re-block got status %d", code)
	}
	var reason string
	if err := h.db.Table("user_blocks").Select("reason").
		Where("blocked_id = ?", ownerID).Row().Scan(&reason); err != nil {
		t.Fatalf("read reason: %v", err)
	}
	if reason != "abuse" {
		t.Errorf("the reason is %q, want the more recent one", reason)
	}
}

func TestBlockingRequiresNoReason(t *testing.T) {
	h := newChatHarness(t)
	id, _, ownerID, buyerToken, _ := h.blockPair(t)

	// No body at all.
	if code := h.block(t, buyerToken, ownerID, nil); code != http.StatusOK {
		t.Fatalf("a block with no reason got status %d", code)
	}
	if code := h.trySend(t, id, buyerToken, "Sababsiz"); code != http.StatusForbidden {
		t.Error("a block with no reason did not take effect")
	}
}

func TestBlockingRejectsBadInput(t *testing.T) {
	h := newChatHarness(t)
	_, _, _, buyerToken, buyerID := h.blockPair(t)

	if code := h.block(t, buyerToken, buyerID, nil); code != http.StatusBadRequest {
		t.Errorf("blocking yourself got status %d, want 400", code)
	}
	missing := "00000000-0000-0000-0000-000000000000"
	if code := h.block(t, buyerToken, missing, nil); code != http.StatusNotFound {
		t.Errorf("blocking a stranger got status %d, want 404", code)
	}
	// A reason outside the accepted set is refused rather than stored.
	if code := h.block(t, buyerToken, missing, map[string]any{"reason": "because"}); code != http.StatusBadRequest {
		t.Errorf("an invented reason got status %d, want 400", code)
	}
	// And every route needs a token.
	for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodDelete} {
		if rec := h.do(t, method, "/api/v1/me/blocks/"+buyerID, nil, ""); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s without a token got %d, want 401", method, rec.Code)
		}
	}
}

func TestABlockTouchesOnlyThatPair(t *testing.T) {
	h := newChatHarness(t)
	id, _, ownerID, buyerToken, _ := h.blockPair(t)

	// The same buyer, a different seller.
	otherToken, _ := h.signUp(t)
	otherApartment := h.publish(t, otherToken)
	rec := h.do(t, http.MethodPost, "/api/v1/conversations",
		map[string]any{"apartment_id": otherApartment}, buyerToken)
	var other dto.ConversationResponse
	if err := json.Unmarshal(decode(t, rec).Data, &other); err != nil {
		t.Fatalf("decode: %v", err)
	}

	h.block(t, buyerToken, ownerID, nil)

	if code := h.trySend(t, id, buyerToken, "Blokdagi"); code != http.StatusForbidden {
		t.Fatalf("the block did not take (status %d)", code)
	}
	// The other conversation is untouched.
	if code := h.trySend(t, other.ID.String(), buyerToken, "Boshqa odam"); code != http.StatusCreated {
		t.Errorf("blocking one person stopped messages to another (status %d)", code)
	}
	if got := h.find(t, buyerToken, other.ID.String(), false); got == nil || got.IsBlocked {
		t.Error("an unrelated conversation reports a block")
	}
}
