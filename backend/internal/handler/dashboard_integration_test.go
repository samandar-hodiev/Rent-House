//go:build integration

// Saved apartments and the dashboard summary, end to end against PostgreSQL.
//
// The security question these are really about: every route here derives the
// user from the token, so the tests check that two accounts see two different
// dashboards and that neither can reach the other's by asking differently.
package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
)

func (h *listingHarness) summary(t *testing.T, token string) dto.DashboardSummaryResponse {
	t.Helper()
	rec := h.do(t, http.MethodGet, "/api/v1/me/dashboard/summary", nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("summary got status %d: %s", rec.Code, rec.Body.String())
	}
	var out dto.DashboardSummaryResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode summary: %v", err)
	}
	return out
}

func (h *listingHarness) favorites(t *testing.T, token string) dto.FavoriteListResponse {
	t.Helper()
	rec := h.do(t, http.MethodGet, "/api/v1/me/favorites", nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("favorites got status %d: %s", rec.Code, rec.Body.String())
	}
	var out dto.FavoriteListResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode favorites: %v", err)
	}
	return out
}

func (h *listingHarness) save(t *testing.T, id, token string) int {
	t.Helper()
	return h.do(t, http.MethodPost, "/api/v1/me/favorites/"+id, nil, token).Code
}

func (h *listingHarness) unsave(t *testing.T, id, token string) int {
	t.Helper()
	return h.do(t, http.MethodDelete, "/api/v1/me/favorites/"+id, nil, token).Code
}

func TestSavingAListingShowsUpInTheDashboard(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	saverToken, _ := h.signUp(t)

	id := h.publish(t, ownerToken)

	before := h.summary(t, saverToken)
	if before.Counts.SavedApartments != 0 {
		t.Fatalf("a new account already has %d saved", before.Counts.SavedApartments)
	}

	if code := h.save(t, id, saverToken); code != http.StatusOK {
		t.Fatalf("save got status %d", code)
	}

	after := h.summary(t, saverToken)
	if after.Counts.SavedApartments != 1 {
		t.Errorf("saved count is %d, want 1", after.Counts.SavedApartments)
	}
	if len(after.RecentSaved) != 1 || after.RecentSaved[0].ID.String() != id {
		t.Errorf("the saved listing is not in recent_saved: %+v", after.RecentSaved)
	}

	// Unsaving takes it away again.
	if code := h.unsave(t, id, saverToken); code != http.StatusOK {
		t.Fatalf("unsave got status %d", code)
	}
	final := h.summary(t, saverToken)
	if final.Counts.SavedApartments != 0 || len(final.RecentSaved) != 0 {
		t.Errorf("unsaving left %d saved", final.Counts.SavedApartments)
	}
}

func TestSavingTwiceCountsOnce(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	saverToken, _ := h.signUp(t)
	id := h.publish(t, ownerToken)

	for i := 0; i < 3; i++ {
		if code := h.save(t, id, saverToken); code != http.StatusOK {
			t.Fatalf("save %d got status %d", i, code)
		}
	}

	if got := h.summary(t, saverToken).Counts.SavedApartments; got != 1 {
		t.Errorf("saving three times produced %d saved, want 1", got)
	}
}

func TestSavedListsAreNotShared(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	firstToken, _ := h.signUp(t)
	secondToken, _ := h.signUp(t)

	id := h.publish(t, ownerToken)
	if code := h.save(t, id, firstToken); code != http.StatusOK {
		t.Fatalf("save got status %d", code)
	}

	// The other account saved nothing, and must see nothing — the list is keyed
	// on the token, and there is no id in the request to point elsewhere.
	other := h.summary(t, secondToken)
	if other.Counts.SavedApartments != 0 || len(other.RecentSaved) != 0 {
		t.Errorf("one account sees another's saved apartments: %+v", other.Counts)
	}
	if items := h.favorites(t, secondToken); len(items.Items) != 0 {
		t.Errorf("the favorites list leaked %d listings", len(items.Items))
	}
}

func TestDashboardCountsOnlyTheCallersListings(t *testing.T) {
	h := newListingHarness(t)
	firstToken, _ := h.signUp(t)
	secondToken, _ := h.signUp(t)

	h.publish(t, firstToken)
	h.publish(t, firstToken)

	draft := validListing()
	draft["publish"] = false
	if code, _ := h.create(t, secondToken, draft); code != http.StatusCreated {
		t.Fatalf("create draft got status %d", code)
	}

	first := h.summary(t, firstToken)
	if first.Counts.ActiveListings != 2 || first.Counts.TotalListings != 2 {
		t.Errorf("first account: active=%d total=%d, want 2 and 2",
			first.Counts.ActiveListings, first.Counts.TotalListings)
	}

	second := h.summary(t, secondToken)
	// A draft counts towards the total but is not live.
	if second.Counts.ActiveListings != 0 || second.Counts.TotalListings != 1 {
		t.Errorf("second account: active=%d total=%d, want 0 and 1",
			second.Counts.ActiveListings, second.Counts.TotalListings)
	}
	if len(second.RecentListings) != 1 {
		t.Errorf("second account sees %d listings, want its own 1", len(second.RecentListings))
	}
	for _, listing := range second.RecentListings {
		if listing.Status != "draft" {
			t.Errorf("second account's listing is %q, so it is not theirs", listing.Status)
		}
	}
}

func TestTheDashboardShowsAtMostThreeOfEach(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	saverToken, _ := h.signUp(t)

	ids := make([]string, 0, 5)
	for i := 0; i < 5; i++ {
		id := h.publish(t, ownerToken)
		ids = append(ids, id)
		if code := h.save(t, id, saverToken); code != http.StatusOK {
			t.Fatalf("save got status %d", code)
		}
	}

	owner := h.summary(t, ownerToken)
	if owner.Counts.ActiveListings != 5 {
		t.Errorf("the counter says %d, want all 5", owner.Counts.ActiveListings)
	}
	if len(owner.RecentListings) != 3 {
		t.Errorf("recent_listings has %d rows, want 3", len(owner.RecentListings))
	}

	saver := h.summary(t, saverToken)
	if saver.Counts.SavedApartments != 5 {
		t.Errorf("the saved counter says %d, want all 5", saver.Counts.SavedApartments)
	}
	if len(saver.RecentSaved) != 3 {
		t.Errorf("recent_saved has %d rows, want 3", len(saver.RecentSaved))
	}
	// Most recently saved first, so the last three saved are the ones shown.
	if saver.RecentSaved[0].ID.String() != ids[4] {
		t.Errorf("recent_saved starts with %s, want the newest save %s",
			saver.RecentSaved[0].ID, ids[4])
	}

	// The full list is still all of them — only the dashboard is capped.
	if all := h.favorites(t, saverToken); len(all.Items) != 5 {
		t.Errorf("the saved page shows %d, want all 5", len(all.Items))
	}
}

func TestAnUnpublishedListingLeavesTheSavedList(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	saverToken, _ := h.signUp(t)
	id := h.publish(t, ownerToken)

	if code := h.save(t, id, saverToken); code != http.StatusOK {
		t.Fatalf("save got status %d", code)
	}

	// Withdrawn by its owner: it can no longer be opened, so promising a card
	// for it would be a card that cannot be rendered.
	body := validListing()
	body["publish"] = false
	if rec := h.do(t, http.MethodPut, "/api/v1/apartments/"+id, body, ownerToken); rec.Code != http.StatusOK {
		t.Fatalf("unpublish got status %d: %s", rec.Code, rec.Body.String())
	}

	summary := h.summary(t, saverToken)
	if summary.Counts.SavedApartments != 0 || len(summary.RecentSaved) != 0 {
		t.Errorf("a withdrawn listing is still counted: %+v", summary.Counts)
	}
}

func TestADraftCannotBeSaved(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	saverToken, _ := h.signUp(t)

	body := validListing()
	body["publish"] = false
	_, draft := h.create(t, ownerToken, body)

	// Indistinguishable from a listing that does not exist: telling a stranger
	// that a draft is there leaks that it is there.
	if code := h.save(t, draft.ID.String(), saverToken); code != http.StatusNotFound {
		t.Errorf("saving a draft got status %d, want 404", code)
	}
}

func TestPrivateDashboardRoutesRequireAToken(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	id := h.publish(t, ownerToken)

	for _, route := range []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/api/v1/me/dashboard/summary"},
		{http.MethodGet, "/api/v1/me/favorites"},
		{http.MethodPost, "/api/v1/me/favorites/" + id},
		{http.MethodDelete, "/api/v1/me/favorites/" + id},
	} {
		rec := h.do(t, route.method, route.path, nil, "")
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s without a token got %d, want 401", route.method, route.path, rec.Code)
		}
	}
}
