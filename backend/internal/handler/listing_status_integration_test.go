//go:build integration

// The listing lifecycle, end to end against PostgreSQL.
//
// Two things are worth checking here rather than in the UI: that a transition
// the interface never offers is refused by the server too, and that removing a
// listing keeps it — because everything pointing at a listing outlives its
// owner's decision to take it down.
package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

func (h *listingHarness) setStatus(t *testing.T, token, id, status string) int {
	t.Helper()
	return h.do(t, http.MethodPatch, "/api/v1/apartments/"+id+"/status",
		map[string]any{"status": status}, token).Code
}

func (h *listingHarness) statusOf(t *testing.T, token, id string) string {
	t.Helper()
	rec := h.do(t, http.MethodGet, "/api/v1/apartments/"+id, nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("get listing got status %d: %s", rec.Code, rec.Body.String())
	}
	var out dto.ApartmentResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode listing: %v", err)
	}
	return out.Status
}

// draft publishes a listing without publishing it.
func (h *listingHarness) draft(t *testing.T, token string) string {
	t.Helper()
	body := validListing()
	body["publish"] = false
	status, created := h.create(t, token, body)
	if status != http.StatusCreated {
		t.Fatalf("draft got status %d", status)
	}
	return created.ID.String()
}

func TestListingLifecycleTransitions(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)

	t.Run("draft goes live", func(t *testing.T) {
		id := h.draft(t, token)
		if got := h.statusOf(t, token, id); got != models.ApartmentStatusDraft {
			t.Fatalf("new draft is %q", got)
		}
		if code := h.setStatus(t, token, id, models.ApartmentStatusActive); code != http.StatusOK {
			t.Fatalf("publishing a draft got status %d", code)
		}
		if got := h.statusOf(t, token, id); got != models.ApartmentStatusActive {
			t.Fatalf("published draft is %q", got)
		}
	})

	t.Run("active pauses and resumes", func(t *testing.T) {
		id := h.publish(t, token)
		if code := h.setStatus(t, token, id, models.ApartmentStatusPending); code != http.StatusOK {
			t.Fatalf("pausing got status %d", code)
		}
		if got := h.statusOf(t, token, id); got != models.ApartmentStatusPending {
			t.Fatalf("paused listing is %q", got)
		}
		if code := h.setStatus(t, token, id, models.ApartmentStatusActive); code != http.StatusOK {
			t.Fatalf("resuming got status %d", code)
		}
	})

	t.Run("active closes", func(t *testing.T) {
		id := h.publish(t, token)
		if code := h.setStatus(t, token, id, models.ApartmentStatusClosed); code != http.StatusOK {
			t.Fatalf("closing got status %d", code)
		}
		if got := h.statusOf(t, token, id); got != models.ApartmentStatusClosed {
			t.Fatalf("closed listing is %q", got)
		}
	})

	// The database insists a listing carries a publication date exactly when it
	// is active, so a transition that forgot one would fail the constraint. The
	// round trip above and back proves both directions are maintained.
	t.Run("publication date follows the status", func(t *testing.T) {
		id := h.publish(t, token)
		for _, target := range []string{
			models.ApartmentStatusPending,
			models.ApartmentStatusActive,
			models.ApartmentStatusClosed,
			models.ApartmentStatusActive,
		} {
			if code := h.setStatus(t, token, id, target); code != http.StatusOK {
				t.Fatalf("moving to %s got status %d", target, code)
			}
		}
	})
}

// The interface never offers these, and neither does the server.
func TestListingLifecycleRefusesNonsenseTransitions(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)

	t.Run("a draft cannot be closed", func(t *testing.T) {
		id := h.draft(t, token)
		if code := h.setStatus(t, token, id, models.ApartmentStatusClosed); code == http.StatusOK {
			t.Fatal("a never-published draft was closed")
		}
	})

	t.Run("a deleted listing cannot go straight back to public", func(t *testing.T) {
		id := h.publish(t, token)
		if code := h.setStatus(t, token, id, models.ApartmentStatusDeleted); code != http.StatusOK {
			t.Fatalf("deleting got status %d", code)
		}
		if code := h.setStatus(t, token, id, models.ApartmentStatusActive); code == http.StatusOK {
			t.Fatal("a deleted listing was published again in one step")
		}
		// It can be restored out of sight, which is the deliberate path back.
		if code := h.setStatus(t, token, id, models.ApartmentStatusDraft); code != http.StatusOK {
			t.Fatalf("restoring to draft got status %d", code)
		}
	})

	t.Run("a status change is not a way into someone else's listing", func(t *testing.T) {
		mine := h.publish(t, token)
		otherToken, _ := h.signUp(t)
		if code := h.setStatus(t, otherToken, mine, models.ApartmentStatusClosed); code == http.StatusOK {
			t.Fatal("a stranger changed the status of a listing they do not own")
		}
		if got := h.statusOf(t, token, mine); got != models.ApartmentStatusActive {
			t.Fatalf("the listing changed anyway: %q", got)
		}
	})
}

// "Delete" keeps the row. Everything pointing at a listing — conversations,
// view history, saved listings — outlives the owner taking it down.
func TestDeleteIsSoftAndRemovesItFromPublicView(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)
	id := h.publish(t, token)

	rec := h.do(t, http.MethodDelete, "/api/v1/apartments/"+id, nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete got status %d: %s", rec.Code, rec.Body.String())
	}

	// Still there for its owner, under its new status.
	if got := h.statusOf(t, token, id); got != models.ApartmentStatusDeleted {
		t.Fatalf("deleted listing is %q, want deleted", got)
	}

	// And gone from the public feed.
	for _, item := range h.list(t, "", "").Items {
		if item.ID.String() == id {
			t.Fatal("a deleted listing is still in the public feed")
		}
	}
}

// Every non-active state is invisible publicly — that is what separates the
// owner's dashboard from the marketplace.
func TestOnlyActiveListingsArePublic(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)

	hidden := map[string]string{}
	for _, status := range []string{
		models.ApartmentStatusPending,
		models.ApartmentStatusClosed,
		models.ApartmentStatusDeleted,
	} {
		id := h.publish(t, token)
		if code := h.setStatus(t, token, id, status); code != http.StatusOK {
			t.Fatalf("moving to %s got status %d", status, code)
		}
		hidden[id] = status
	}
	hidden[h.draft(t, token)] = models.ApartmentStatusDraft

	public := map[string]bool{}
	for _, item := range h.list(t, "", "").Items {
		public[item.ID.String()] = true
	}
	for id, status := range hidden {
		if public[id] {
			t.Fatalf("a %s listing is publicly visible", status)
		}
	}

	// The owner still sees all of them.
	rec := h.do(t, http.MethodGet, "/api/v1/me/apartments?limit=60", nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("own listings got status %d", rec.Code)
	}
	var mine dto.ApartmentListResponse
	if err := json.Unmarshal(decode(t, rec).Data, &mine); err != nil {
		t.Fatalf("decode: %v", err)
	}
	owned := map[string]bool{}
	for _, item := range mine.Items {
		owned[item.ID.String()] = true
	}
	for id, status := range hidden {
		if !owned[id] {
			t.Fatalf("the owner cannot see their own %s listing", status)
		}
	}
}
