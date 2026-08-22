//go:build integration

// End-to-end analytics: real router, real service, real repository, real
// PostgreSQL. Same harness and database as the listing tests, same tag.
//
// These are written against observable behaviour — post a listing, open it,
// read the dashboard — rather than against the SQL, because what matters is
// that the number an owner sees is the number of people who actually looked.
package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// view opens a listing the way a browser would, optionally signed in.
//
// `agent` stands in for a distinct anonymous visitor: signed-out viewers are
// told apart by address and user agent, and every request from httptest shares
// an address.
func (h *listingHarness) view(t *testing.T, id, token, agent string) int {
	t.Helper()
	rec := h.doWithAgent(t, http.MethodGet, "/api/v1/apartments/"+id, nil, token, agent)
	return rec.Code
}

// doWithAgent is `do` plus a User-Agent, which is half of what tells two
// signed-out visitors apart.
func (h *listingHarness) doWithAgent(
	t *testing.T, method, path string, body any, header, agent string,
) *httptest.ResponseRecorder {
	t.Helper()

	var reader *bytes.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("encode body: %v", err)
		}
		reader = bytes.NewReader(encoded)
	} else {
		reader = bytes.NewReader(nil)
	}

	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", agent)
	if header != "" {
		req.Header.Set("Authorization", header)
	}

	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	return rec
}

func (h *listingHarness) ownerAnalytics(t *testing.T, token string) dto.ViewsAnalyticsResponse {
	t.Helper()
	rec := h.do(t, http.MethodGet, "/api/v1/me/analytics/views", nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("owner analytics got status %d: %s", rec.Code, rec.Body.String())
	}
	var out dto.ViewsAnalyticsResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode analytics: %v", err)
	}
	return out
}

func (h *listingHarness) apartmentAnalytics(
	t *testing.T, id, token string,
) (int, dto.ViewsAnalyticsResponse) {
	t.Helper()
	rec := h.do(t, http.MethodGet, "/api/v1/apartments/"+id+"/analytics", nil, token)
	if rec.Code != http.StatusOK {
		return rec.Code, dto.ViewsAnalyticsResponse{}
	}
	var out dto.ViewsAnalyticsResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode analytics: %v", err)
	}
	return rec.Code, out
}

// publish creates a live listing and returns its id.
func (h *listingHarness) publish(t *testing.T, token string) string {
	t.Helper()
	body := validListing()
	body["publish"] = true
	status, created := h.create(t, token, body)
	if status != http.StatusCreated {
		t.Fatalf("publish got status %d", status)
	}
	return created.ID.String()
}

// sumDaily is what the chart's daily line adds up to.
func sumDaily(points []dto.DayPoint) int64 {
	var total int64
	for _, point := range points {
		total += point.Views
	}
	return total
}

func TestPublishingStampsPublishedAt(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)

	// A draft is not live, so it has no publication date and no timeline.
	draft := validListing()
	draft["publish"] = false
	_, created := h.create(t, token, draft)
	if created.PublishedAt != nil {
		t.Errorf("a draft carries published_at %v", created.PublishedAt)
	}

	id := h.publish(t, token)
	_, live := h.apartmentAnalytics(t, id, token)
	if live.PublishedAt == nil {
		t.Fatal("a published listing has no published_at, so analytics have no start")
	}
	if *live.PublishedAt != time.Now().In(tashkent(t)).Format("2006-01-02") {
		t.Errorf("published_at is %q, want today", *live.PublishedAt)
	}
}

func TestAViewIsRecordedForAnotherUser(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	viewerToken, _ := h.signUp(t)

	id := h.publish(t, ownerToken)

	before := h.ownerAnalytics(t, ownerToken)
	if before.TotalViews != 0 {
		t.Fatalf("a new listing already has %d views", before.TotalViews)
	}

	if code := h.view(t, id, viewerToken, "viewer-b"); code != http.StatusOK {
		t.Fatalf("viewing got status %d", code)
	}

	after := h.ownerAnalytics(t, ownerToken)
	if after.TotalViews != 1 {
		t.Errorf("total views is %d, want 1", after.TotalViews)
	}
	if got := sumDaily(after.Daily); got != 1 {
		t.Errorf("the daily series sums to %d, want 1", got)
	}
}

func TestTheOwnersOwnVisitsAreNotCounted(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	id := h.publish(t, ownerToken)

	for i := 0; i < 3; i++ {
		h.view(t, id, ownerToken, "owner-agent")
	}

	analytics := h.ownerAnalytics(t, ownerToken)
	if analytics.TotalViews != 0 {
		t.Errorf("the owner's own %d visits were counted", analytics.TotalViews)
	}
}

func TestRefreshingDoesNotInflateTheCount(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	viewerToken, _ := h.signUp(t)
	id := h.publish(t, ownerToken)

	// One reader, ten refreshes. That is one interested person.
	for i := 0; i < 10; i++ {
		h.view(t, id, viewerToken, "viewer-b")
	}

	analytics := h.ownerAnalytics(t, ownerToken)
	if analytics.TotalViews != 1 {
		t.Errorf("ten refreshes produced %d views, want 1", analytics.TotalViews)
	}
}

func TestDifferentViewersEachCount(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	id := h.publish(t, ownerToken)

	firstToken, _ := h.signUp(t)
	secondToken, _ := h.signUp(t)

	h.view(t, id, firstToken, "viewer-b")
	h.view(t, id, secondToken, "viewer-c")
	// And a signed-out visitor, who counts too.
	h.view(t, id, "", "anonymous-visitor")

	analytics := h.ownerAnalytics(t, ownerToken)
	if analytics.TotalViews != 3 {
		t.Errorf("three distinct viewers produced %d views, want 3", analytics.TotalViews)
	}
}

func TestAnonymousViewersAreToldApart(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	id := h.publish(t, ownerToken)

	h.view(t, id, "", "browser-one")
	h.view(t, id, "", "browser-one") // same visitor again
	h.view(t, id, "", "browser-two")

	analytics := h.ownerAnalytics(t, ownerToken)
	if analytics.TotalViews != 2 {
		t.Errorf("two anonymous visitors produced %d views, want 2", analytics.TotalViews)
	}
}

func TestDraftsCollectNoViews(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	viewerToken, _ := h.signUp(t)

	body := validListing()
	body["publish"] = false
	_, draft := h.create(t, ownerToken, body)

	// A stranger cannot see it at all, so there is nothing to count.
	if code := h.view(t, draft.ID.String(), viewerToken, "viewer-b"); code != http.StatusNotFound {
		t.Fatalf("a stranger got status %d for a draft, want 404", code)
	}

	analytics := h.ownerAnalytics(t, ownerToken)
	if analytics.TotalViews != 0 {
		t.Errorf("an unpublished listing collected %d views", analytics.TotalViews)
	}
	if analytics.PublishedAt != nil {
		t.Errorf("an owner with only drafts has a timeline starting %q", *analytics.PublishedAt)
	}
}

func TestSeveralListingsAggregateIntoOneTimeline(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)

	first := h.publish(t, ownerToken)
	second := h.publish(t, ownerToken)

	// Two viewers on the first listing, one on the second.
	h.view(t, first, "", "visitor-1")
	h.view(t, first, "", "visitor-2")
	h.view(t, second, "", "visitor-3")

	dashboard := h.ownerAnalytics(t, ownerToken)
	if dashboard.TotalViews != 3 {
		t.Errorf("the dashboard totals %d views, want 3", dashboard.TotalViews)
	}

	// And each listing still answers for itself — the same aggregation with a
	// narrower scope, which is what per-listing analytics needs.
	_, firstOnly := h.apartmentAnalytics(t, first, ownerToken)
	if firstOnly.TotalViews != 2 {
		t.Errorf("the first listing reports %d views, want 2", firstOnly.TotalViews)
	}
	_, secondOnly := h.apartmentAnalytics(t, second, ownerToken)
	if secondOnly.TotalViews != 1 {
		t.Errorf("the second listing reports %d views, want 1", secondOnly.TotalViews)
	}
	if firstOnly.TotalViews+secondOnly.TotalViews != dashboard.TotalViews {
		t.Error("the per-listing figures do not add up to the dashboard's")
	}
}

func TestOnlyTheOwnerReadsAListingsAnalytics(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	strangerToken, _ := h.signUp(t)

	id := h.publish(t, ownerToken)

	if code, _ := h.apartmentAnalytics(t, id, strangerToken); code != http.StatusForbidden {
		t.Errorf("a stranger got status %d, want 403", code)
	}
	if code, _ := h.apartmentAnalytics(t, id, ""); code != http.StatusUnauthorized {
		t.Errorf("an anonymous request got status %d, want 401", code)
	}
}

func TestTheTimelineStartsAtPublicationAndIsContinuous(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	id := h.publish(t, ownerToken)
	h.view(t, id, "", "visitor-1")

	analytics := h.ownerAnalytics(t, ownerToken)

	// Published today, so the daily series is exactly today.
	if len(analytics.Daily) != 1 {
		t.Fatalf("a listing published today has %d daily points, want 1", len(analytics.Daily))
	}
	today := time.Now().In(tashkent(t)).Format("2006-01-02")
	if analytics.Daily[0].Date != today {
		t.Errorf("the only day is %q, want today (%q)", analytics.Daily[0].Date, today)
	}
	if analytics.RangeFrom == nil || *analytics.RangeFrom != *analytics.PublishedAt {
		t.Error("the range does not start at publication")
	}

	// One week and one month, both holding the same single view.
	if len(analytics.Weekly) != 1 || analytics.Weekly[0].Views != 1 {
		t.Errorf("weekly is %+v, want one week with one view", analytics.Weekly)
	}
	if len(analytics.Monthly) != 1 || analytics.Monthly[0].Views != 1 {
		t.Errorf("monthly is %+v, want one month with one view", analytics.Monthly)
	}
	if analytics.Monthly[0].Month != today[:7] {
		t.Errorf("the month is %q, want %q", analytics.Monthly[0].Month, today[:7])
	}
}

func TestViewsAreGroupedByTashkentCalendarDay(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	id := h.publish(t, ownerToken)

	loc := tashkent(t)
	now := time.Now().In(loc)

	// 23:30 local yesterday. In UTC that is 18:30 — still yesterday — but a
	// 02:00 local view would be 21:00 UTC the day before, which is the case
	// that used to move a reader into the wrong day. Both are checked by
	// filing them directly and asking which day they come back on.
	lateYesterday := time.Date(now.Year(), now.Month(), now.Day(), 23, 30, 0, 0, loc).AddDate(0, 0, -1)
	earlyToday := time.Date(now.Year(), now.Month(), now.Day(), 2, 0, 0, 0, loc)

	// Backdate the listing so those days are inside its range.
	if err := h.db.Exec(
		"UPDATE apartments SET published_at = ? WHERE id = ?", lateYesterday.Add(-time.Hour), id,
	).Error; err != nil {
		t.Fatalf("backdate listing: %v", err)
	}

	for i, at := range []time.Time{lateYesterday, earlyToday} {
		if err := h.db.Exec(`
			INSERT INTO apartment_views (apartment_id, viewer_key, view_bucket, viewed_at)
			VALUES (?, ?, date_trunc('hour', ? AT TIME ZONE ?), ?)`,
			id, fmt.Sprintf("a:test-%d", i), at, models.TashkentZone, at,
		).Error; err != nil {
			t.Fatalf("insert view %d: %v", i, err)
		}
	}

	analytics := h.ownerAnalytics(t, ownerToken)
	byDay := map[string]int64{}
	for _, point := range analytics.Daily {
		byDay[point.Date] = point.Views
	}

	yesterdayKey := lateYesterday.Format("2006-01-02")
	todayKey := earlyToday.Format("2006-01-02")
	if byDay[yesterdayKey] != 1 {
		t.Errorf("a 23:30 view landed on %d views for %s, want 1", byDay[yesterdayKey], yesterdayKey)
	}
	if byDay[todayKey] != 1 {
		t.Errorf("an 02:00 view landed on %d views for %s, want 1", byDay[todayKey], todayKey)
	}
}

func TestAnOwnerWithNothingPublishedGetsAnEmptyTimeline(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)

	analytics := h.ownerAnalytics(t, token)
	if analytics.TotalViews != 0 {
		t.Errorf("total views is %d for an owner with no listings", analytics.TotalViews)
	}
	if analytics.PublishedAt != nil {
		t.Error("a timeline start was reported for an owner with no listings")
	}
	// Empty rather than null, so the client maps over them without a guard.
	if analytics.Daily == nil || analytics.Weekly == nil || analytics.Monthly == nil {
		t.Error("a series came back null instead of empty")
	}
	if len(analytics.Daily) != 0 {
		t.Errorf("an owner with no listings got %d daily points", len(analytics.Daily))
	}
}

func TestUnpublishingRemovesTheListingFromAnalytics(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	id := h.publish(t, ownerToken)
	h.view(t, id, "", "visitor-1")

	if h.ownerAnalytics(t, ownerToken).TotalViews != 1 {
		t.Fatal("the view was not recorded")
	}

	// Back to a draft: it is no longer live, so it no longer contributes.
	body := validListing()
	body["publish"] = false
	rec := h.do(t, http.MethodPut, "/api/v1/apartments/"+id, body, ownerToken)
	if rec.Code != http.StatusOK {
		t.Fatalf("unpublish got status %d: %s", rec.Code, rec.Body.String())
	}

	analytics := h.ownerAnalytics(t, ownerToken)
	if analytics.TotalViews != 0 {
		t.Errorf("an unpublished listing still contributes %d views", analytics.TotalViews)
	}
}

func TestRepublishingKeepsTheOriginalPublicationDate(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	id := h.publish(t, ownerToken)

	// Pretend it went live a week ago.
	original := time.Now().AddDate(0, 0, -7)
	if err := h.db.Exec(
		"UPDATE apartments SET published_at = ? WHERE id = ?", original, id,
	).Error; err != nil {
		t.Fatalf("backdate: %v", err)
	}

	// Editing a live listing must not restart its history.
	body := validListing()
	body["publish"] = true
	body["title"] = "Yangilangan sarlavha, kamida o'n belgi"
	if rec := h.do(t, http.MethodPut, "/api/v1/apartments/"+id, body, ownerToken); rec.Code != http.StatusOK {
		t.Fatalf("edit got status %d: %s", rec.Code, rec.Body.String())
	}

	_, analytics := h.apartmentAnalytics(t, id, ownerToken)
	want := original.In(tashkent(t)).Format("2006-01-02")
	if analytics.PublishedAt == nil || *analytics.PublishedAt != want {
		t.Errorf("published_at is %v after an edit, want %q", analytics.PublishedAt, want)
	}
}

func tashkent(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(models.TashkentZone)
	if err != nil {
		t.Fatalf("load %s: %v", models.TashkentZone, err)
	}
	return loc
}

// The card and the chart must never disagree.
//
// "N ta ko'rish" on a listing card reads apartments.views_count; the dashboard
// chart reads apartment_views. They are written in one transaction so they
// cannot drift — this is the test that says so, because before 0006 they were
// two independent numbers and a listing could show 14 views with no events
// behind them.
func TestTheListingCounterMatchesTheRecordedEvents(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	id := h.publish(t, ownerToken)

	// A freshly published listing starts at nothing.
	if got := h.viewsCount(t, id, ownerToken); got != 0 {
		t.Fatalf("a new listing shows %d views, want 0", got)
	}

	// The owner's own visits change neither figure.
	for i := 0; i < 3; i++ {
		h.view(t, id, ownerToken, "owner-agent")
	}
	if got := h.viewsCount(t, id, ownerToken); got != 0 {
		t.Errorf("the owner's visits pushed the card to %d", got)
	}

	// Three other people, one each.
	for i, agent := range []string{"visitor-1", "visitor-2", "visitor-3"} {
		if code := h.view(t, id, "", agent); code != http.StatusOK {
			t.Fatalf("visitor %d got status %d", i, code)
		}
	}

	card := h.viewsCount(t, id, ownerToken)
	_, analytics := h.apartmentAnalytics(t, id, ownerToken)

	if card != 3 {
		t.Errorf("the card shows %d views, want 3", card)
	}
	if analytics.TotalViews != int64(card) {
		t.Errorf("the card says %d and the chart says %d", card, analytics.TotalViews)
	}
	if sum := sumDaily(analytics.Daily); sum != int64(card) {
		t.Errorf("the daily series sums to %d but the card says %d", sum, card)
	}
}

// viewsCount reads the number a listing card renders.
func (h *listingHarness) viewsCount(t *testing.T, id, token string) int64 {
	t.Helper()
	rec := h.do(t, http.MethodGet, "/api/v1/apartments/"+id, nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("get apartment got status %d", rec.Code)
	}
	var out dto.ApartmentResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode apartment: %v", err)
	}
	return out.ViewsCount
}
