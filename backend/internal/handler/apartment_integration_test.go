//go:build integration

// End-to-end listing tests: real router, real service, real repository, real
// PostgreSQL. They share the harness and the database from
// auth_integration_test.go and run under the same tag:
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./...
//
// The security requirement these exist for: a listing may only be changed by
// the account that owns it, and that must hold at the API, not merely in the
// UI that usually calls it.
package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
)

// listingHarness adds the apartment routes to the shared auth harness, so a
// test can register a real user and then act as them.
type listingHarness struct {
	*harness
}

func newListingHarness(t *testing.T) *listingHarness {
	t.Helper()
	h := newHarness(t)

	apartments := repository.NewApartmentRepository(h.db)

	// The real analytics service, not a stub: recording a view is part of what
	// GET /apartments/:id does, and these tests are here to exercise it.
	analyticsService, err := service.NewAnalyticsService(
		repository.NewAnalyticsRepository(h.db), apartments, integrationSecret,
	)
	if err != nil {
		t.Fatalf("analytics service: %v", err)
	}
	analyticsHandler := NewAnalyticsHandler(analyticsService)
	apartmentHandler := NewApartmentHandler(service.NewApartmentService(apartments), analyticsService)

	v1 := h.router.Group("/api/v1")
	v1.GET("/districts", apartmentHandler.Districts)

	listings := v1.Group("/apartments")
	listings.GET("", apartmentHandler.List)
	listings.GET("/:id", middleware.OptionalAuth(h.tokens), apartmentHandler.Get)
	listings.POST("", middleware.Auth(h.tokens), apartmentHandler.Create)
	listings.PUT("/:id", middleware.Auth(h.tokens), apartmentHandler.Update)
	listings.DELETE("/:id", middleware.Auth(h.tokens), apartmentHandler.Delete)
	listings.GET("/:id/analytics", middleware.Auth(h.tokens), analyticsHandler.ApartmentViews)

	me := v1.Group("/me", middleware.Auth(h.tokens))
	me.GET("/apartments", apartmentHandler.ListMine)
	me.GET("/apartments/stats", apartmentHandler.Stats)
	me.GET("/analytics/views", analyticsHandler.OwnerViews)

	favoriteHandler := NewFavoriteHandler(service.NewFavoriteService(
		repository.NewFavoriteRepository(h.db), apartments, repository.NewChatRepository(h.db),
	))
	me.GET("/favorites", favoriteHandler.List)
	me.POST("/favorites/:apartmentId", favoriteHandler.Save)
	me.DELETE("/favorites/:apartmentId", favoriteHandler.Unsave)
	me.GET("/dashboard/summary", favoriteHandler.Summary)

	// Each test starts from a known table. Listings are the subject here, so
	// leftovers from a previous run would make counts meaningless.
	if err := h.db.Exec("DELETE FROM apartments").Error; err != nil {
		t.Fatalf("clear apartments: %v", err)
	}

	return &listingHarness{harness: h}
}

// validListing is a complete, publishable request. Tests copy it and break one
// field, so a failure names the field it was about.
func validListing() map[string]any {
	return map[string]any{
		"title":         "Chilonzorda yorug' 2 xonali kvartira",
		"description":   "Metro yaqinida, ta'mirlangan.",
		"price":         "4500000",
		"currency":      "UZS",
		"rental_period": "monthly",
		"rooms":         2,
		"area":          54,
		"floor":         3,
		"total_floors":  9,
		"furnished":     true,
		"district_slug": "chilonzor",
		"neighborhood":  "Qatortol",
		"address":       "Qatortol ko'chasi 12",
		"latitude":      41.2758,
		"longitude":     69.2044,
		"deposit":       "4500000",
		"utilities":     "SEPARATE",
		"rules":         []string{"no-smoking"},
		"amenities":     []string{"wifi", "ac"},
		"images": []map[string]any{
			{"url": "http://localhost:8081/uploads/2026-08/a.jpg", "is_primary": true},
		},
		"publish": true,
	}
}

// signUp registers a fresh account and returns a ready-to-send Authorization
// header plus the new account's id.
//
// The header rather than the bare token, because `do` writes whatever it is
// given straight into the header — handing it a naked token would produce a 401
// that looks like an authorization bug rather than a test one.
func (h *listingHarness) signUp(t *testing.T) (authHeader, userID string) {
	t.Helper()
	auth := h.registerFully(t, "email", uniqueEmail())
	return "Bearer " + auth.AccessToken, auth.User.ID
}

// create posts a listing as the given user and returns the decoded response.
func (h *listingHarness) create(
	t *testing.T, token string, body map[string]any,
) (int, dto.ApartmentResponse) {
	t.Helper()
	rec := h.do(t, http.MethodPost, "/api/v1/apartments", body, token)
	if rec.Code != http.StatusCreated {
		return rec.Code, dto.ApartmentResponse{}
	}
	var out dto.ApartmentResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode created apartment: %v", err)
	}
	return rec.Code, out
}

func (h *listingHarness) list(t *testing.T, query, token string) dto.ApartmentListResponse {
	t.Helper()
	rec := h.do(t, http.MethodGet, "/api/v1/apartments"+query, nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("list got status %d: %s", rec.Code, rec.Body.String())
	}
	var out dto.ApartmentListResponse
	if err := json.Unmarshal(decode(t, rec).Data, &out); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	return out
}

func contains(items []dto.ApartmentResponse, id string) bool {
	for _, item := range items {
		if item.ID.String() == id {
			return true
		}
	}
	return false
}

// --- create ---------------------------------------------------------------

func TestCreateListingStoresEverythingTheFormCollects(t *testing.T) {
	h := newListingHarness(t)
	token, userID := h.signUp(t)

	status, created := h.create(t, token, validListing())
	if status != http.StatusCreated {
		t.Fatalf("got status %d, want 201", status)
	}

	if created.ID.String() == "" {
		t.Error("no database id was returned")
	}
	if created.Status != models.ApartmentStatusActive {
		t.Errorf("status is %q, want active for a published listing", created.Status)
	}
	// The owner comes from the token, and this is the assertion that says so.
	if created.Owner == nil || created.Owner.ID.String() != userID {
		t.Errorf("owner is %v, want the authenticated user %s", created.Owner, userID)
	}
	if created.District == nil || created.District.Slug != "chilonzor" {
		t.Errorf("district was not resolved: %v", created.District)
	}
	// Money must survive the round trip exactly; a float would not.
	if created.Price != "4500000" {
		t.Errorf("price is %q, want 4500000", created.Price)
	}
	if created.Neighborhood != "Qatortol" || created.Utilities != "SEPARATE" {
		t.Errorf("the 0003 columns were not stored: %+v", created)
	}
	if len(created.Rules) != 1 || created.Rules[0] != "no-smoking" {
		t.Errorf("rules are %v, want [no-smoking]", created.Rules)
	}
	if len(created.Amenities) != 2 {
		t.Errorf("amenities are %v, want two", created.Amenities)
	}
	if len(created.Images) != 1 || !created.Images[0].IsPrimary {
		t.Errorf("images are %v, want one cover", created.Images)
	}
	if created.CreatedAt.IsZero() || created.UpdatedAt.IsZero() {
		t.Error("timestamps are missing")
	}
}

// The client cannot nominate an owner. Even when it tries, the token wins.
func TestCreateListingIgnoresAnOwnerSuppliedByTheClient(t *testing.T) {
	h := newListingHarness(t)
	token, userID := h.signUp(t)
	_, otherID := h.signUp(t)

	body := validListing()
	body["owner_id"] = otherID
	body["status"] = models.ApartmentStatusClosed
	body["views_count"] = 9999

	_, created := h.create(t, token, body)

	if created.Owner.ID.String() != userID {
		t.Errorf("owner is %s, want the authenticated user %s", created.Owner.ID, userID)
	}
	if created.Status != models.ApartmentStatusActive {
		t.Errorf("the client set the status to %q", created.Status)
	}
	if created.ViewsCount != 0 {
		t.Errorf("the client set views_count to %d", created.ViewsCount)
	}
}

func TestCreateListingRequiresAuthentication(t *testing.T) {
	h := newListingHarness(t)
	rec := h.do(t, http.MethodPost, "/api/v1/apartments", validListing(), "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got status %d, want 401", rec.Code)
	}
}

func TestCreateListingValidation(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)

	cases := map[string]struct {
		mutate func(map[string]any)
		code   string
	}{
		"title too short":      {func(b map[string]any) { b["title"] = "uy" }, "validation_failed"},
		"price not positive":   {func(b map[string]any) { b["price"] = "0" }, "invalid_price"},
		"price not a number":   {func(b map[string]any) { b["price"] = "arzon" }, "validation_failed"},
		"unknown currency":     {func(b map[string]any) { b["currency"] = "EUR" }, "validation_failed"},
		"unknown district":     {func(b map[string]any) { b["district_slug"] = "atlantis" }, "invalid_district"},
		"unknown amenity":      {func(b map[string]any) { b["amenities"] = []string{"teleport"} }, "invalid_amenity"},
		"floor above building": {func(b map[string]any) { b["floor"] = 10; b["total_floors"] = 5 }, "invalid_floors"},
		"latitude off world":   {func(b map[string]any) { b["latitude"] = 999.0 }, "validation_failed"},
		"rooms zero":           {func(b map[string]any) { b["rooms"] = 0 }, "validation_failed"},
		"area negative":        {func(b map[string]any) { b["area"] = -5 }, "validation_failed"},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			body := validListing()
			tc.mutate(body)

			rec := h.do(t, http.MethodPost, "/api/v1/apartments", body, token)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("got status %d, want 400: %s", rec.Code, rec.Body.String())
			}
			if got := decode(t, rec).Error; got != tc.code {
				t.Errorf("got error code %q, want %q", got, tc.code)
			}
		})
	}
}

// --- read -----------------------------------------------------------------

func TestPublishedListingIsPubliclyVisible(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)
	_, created := h.create(t, token, validListing())

	page := h.list(t, "", "")
	if !contains(page.Items, created.ID.String()) {
		t.Error("the published listing is missing from the public feed")
	}
	if page.Total < 1 {
		t.Errorf("total is %d, want at least 1", page.Total)
	}

	rec := h.do(t, http.MethodGet, "/api/v1/apartments/"+created.ID.String(), nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("detail got status %d, want 200", rec.Code)
	}
}

// A draft belongs to its author until they publish it. Everyone else is told it
// does not exist — not that it exists and is off limits.
func TestDraftIsVisibleOnlyToItsOwner(t *testing.T) {
	h := newListingHarness(t)
	ownerToken, _ := h.signUp(t)
	strangerToken, _ := h.signUp(t)

	body := validListing()
	body["publish"] = false
	_, draft := h.create(t, ownerToken, body)

	if draft.Status != models.ApartmentStatusDraft {
		t.Fatalf("status is %q, want draft", draft.Status)
	}

	if page := h.list(t, "", ""); contains(page.Items, draft.ID.String()) {
		t.Error("a draft appeared in the public feed")
	}

	path := "/api/v1/apartments/" + draft.ID.String()
	for name, token := range map[string]string{"anonymous": "", "another user": strangerToken} {
		if rec := h.do(t, http.MethodGet, path, nil, token); rec.Code != http.StatusNotFound {
			t.Errorf("%s got status %d for a draft, want 404", name, rec.Code)
		}
	}
	if rec := h.do(t, http.MethodGet, path, nil, ownerToken); rec.Code != http.StatusOK {
		t.Errorf("the owner got status %d for their own draft, want 200", rec.Code)
	}
}

func TestMissingListingIsNotFound(t *testing.T) {
	h := newListingHarness(t)
	for name, path := range map[string]string{
		"unknown id":   "/api/v1/apartments/" + uuidString(),
		"malformed id": "/api/v1/apartments/not-a-uuid",
	} {
		if rec := h.do(t, http.MethodGet, path, nil, ""); rec.Code != http.StatusNotFound {
			t.Errorf("%s got status %d, want 404", name, rec.Code)
		}
	}
}

// --- owner listings -------------------------------------------------------

func TestOwnerListingsShowOnlyYourOwn(t *testing.T) {
	h := newListingHarness(t)
	tokenA, _ := h.signUp(t)
	tokenB, _ := h.signUp(t)

	_, mine := h.create(t, tokenA, validListing())
	_, theirs := h.create(t, tokenB, validListing())

	rec := h.do(t, http.MethodGet, "/api/v1/me/apartments", nil, tokenA)
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200", rec.Code)
	}
	var page dto.ApartmentListResponse
	if err := json.Unmarshal(decode(t, rec).Data, &page); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if !contains(page.Items, mine.ID.String()) {
		t.Error("the owner's own listing is missing")
	}
	if contains(page.Items, theirs.ID.String()) {
		t.Error("another user's listing leaked into the owner's dashboard")
	}
}

func TestOwnerStatsCountRealListings(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)

	h.create(t, token, validListing())
	draft := validListing()
	draft["publish"] = false
	h.create(t, token, draft)

	rec := h.do(t, http.MethodGet, "/api/v1/me/apartments/stats", nil, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200", rec.Code)
	}
	var stats struct {
		Active int64 `json:"active_listings"`
		Total  int64 `json:"total_listings"`
	}
	if err := json.Unmarshal(decode(t, rec).Data, &stats); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if stats.Active != 1 || stats.Total != 2 {
		t.Errorf("got active=%d total=%d, want 1 and 2", stats.Active, stats.Total)
	}
}

// --- ownership ------------------------------------------------------------

// The heart of it: changing the id in the URL must not change what you may do.
func TestAnotherUserCannotModifyYourListing(t *testing.T) {
	h := newListingHarness(t)
	tokenA, _ := h.signUp(t)
	tokenB, _ := h.signUp(t)

	_, mine := h.create(t, tokenA, validListing())
	path := "/api/v1/apartments/" + mine.ID.String()

	stolen := validListing()
	stolen["title"] = "Taken over by another account"

	rec := h.do(t, http.MethodPut, path, stolen, tokenB)
	if rec.Code != http.StatusForbidden {
		t.Errorf("update by a stranger got status %d, want 403", rec.Code)
	}
	if got := decode(t, rec).Error; got != "not_apartment_owner" {
		t.Errorf("got error code %q, want not_apartment_owner", got)
	}

	rec = h.do(t, http.MethodDelete, path, nil, tokenB)
	if rec.Code != http.StatusForbidden {
		t.Errorf("delete by a stranger got status %d, want 403", rec.Code)
	}

	// And nothing actually changed.
	rec = h.do(t, http.MethodGet, path, nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("the listing is gone: status %d", rec.Code)
	}
	var after dto.ApartmentResponse
	if err := json.Unmarshal(decode(t, rec).Data, &after); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if after.Title == "Taken over by another account" {
		t.Error("a stranger's update was applied")
	}
}

func TestWritesRequireAuthentication(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)
	_, mine := h.create(t, token, validListing())
	path := "/api/v1/apartments/" + mine.ID.String()

	for name, call := range map[string]func() int{
		"update": func() int { return h.do(t, http.MethodPut, path, validListing(), "").Code },
		"delete": func() int { return h.do(t, http.MethodDelete, path, nil, "").Code },
		"mine":   func() int { return h.do(t, http.MethodGet, "/api/v1/me/apartments", nil, "").Code },
	} {
		if got := call(); got != http.StatusUnauthorized {
			t.Errorf("anonymous %s got status %d, want 401", name, got)
		}
	}
}

// --- update / delete ------------------------------------------------------

func TestOwnerCanUpdateTheirListing(t *testing.T) {
	h := newListingHarness(t)
	token, userID := h.signUp(t)
	_, created := h.create(t, token, validListing())

	updated := validListing()
	updated["title"] = "Yangilangan sarlavha: chiroyli kvartira"
	updated["price"] = "5000000"
	updated["rooms"] = 3

	path := "/api/v1/apartments/" + created.ID.String()
	rec := h.do(t, http.MethodPut, path, updated, token)
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200: %s", rec.Code, rec.Body.String())
	}

	// Read it back rather than trusting the response, which is the check that
	// PostgreSQL — not a cache or the request body — holds the new values.
	rec = h.do(t, http.MethodGet, path, nil, "")
	var after dto.ApartmentResponse
	if err := json.Unmarshal(decode(t, rec).Data, &after); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if after.Title != "Yangilangan sarlavha: chiroyli kvartira" {
		t.Errorf("title is %q", after.Title)
	}
	if after.Price != "5000000" || after.Rooms != 3 {
		t.Errorf("price/rooms are %s/%d", after.Price, after.Rooms)
	}
	// An edit must not be able to hand the listing to someone else.
	if after.Owner.ID.String() != userID {
		t.Errorf("owner changed to %s", after.Owner.ID)
	}
}

func TestOwnerCanDeleteTheirListing(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)
	_, created := h.create(t, token, validListing())
	path := "/api/v1/apartments/" + created.ID.String()

	if rec := h.do(t, http.MethodDelete, path, nil, token); rec.Code != http.StatusOK {
		t.Fatalf("delete got status %d, want 200", rec.Code)
	}
	if rec := h.do(t, http.MethodGet, path, nil, ""); rec.Code != http.StatusNotFound {
		t.Errorf("the deleted listing still resolves: status %d", rec.Code)
	}
	if page := h.list(t, "", ""); contains(page.Items, created.ID.String()) {
		t.Error("the deleted listing is still in the feed")
	}
	// A repeated delete — a double-clicked button — is a 404, not a 500.
	if rec := h.do(t, http.MethodDelete, path, nil, token); rec.Code != http.StatusNotFound {
		t.Errorf("second delete got status %d, want 404", rec.Code)
	}
}

// --- filtering and pagination ---------------------------------------------

func TestListFiltersAndPagination(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)

	cheap := validListing()
	cheap["price"] = "2000000"
	cheap["rooms"] = 1
	cheap["title"] = "Sergelida arzon 1 xonali kvartira"
	cheap["district_slug"] = "sergeli"
	h.create(t, token, cheap)

	h.create(t, token, validListing()) // chilonzor, 2 rooms, 4 500 000

	t.Run("district", func(t *testing.T) {
		page := h.list(t, "?district=sergeli", "")
		if page.Total != 1 {
			t.Fatalf("total is %d, want 1", page.Total)
		}
		if page.Items[0].District.Slug != "sergeli" {
			t.Errorf("got %s", page.Items[0].District.Slug)
		}
	})

	t.Run("rooms", func(t *testing.T) {
		page := h.list(t, "?rooms=1", "")
		for _, item := range page.Items {
			if item.Rooms != 1 {
				t.Errorf("a %d-room listing matched rooms=1", item.Rooms)
			}
		}
	})

	t.Run("price range", func(t *testing.T) {
		page := h.list(t, "?min_price=3000000", "")
		for _, item := range page.Items {
			if item.Price == "2000000" {
				t.Error("a listing below the minimum matched")
			}
		}
	})

	t.Run("keyword", func(t *testing.T) {
		if page := h.list(t, "?keyword=Sergelida", ""); page.Total != 1 {
			t.Errorf("total is %d, want 1", page.Total)
		}
	})

	t.Run("sort", func(t *testing.T) {
		page := h.list(t, "?sort=price_asc", "")
		if len(page.Items) >= 2 && page.Items[0].Price != "2000000" {
			t.Errorf("price_asc put %s first", page.Items[0].Price)
		}
	})

	t.Run("pagination", func(t *testing.T) {
		page := h.list(t, "?limit=1&page=1", "")
		if len(page.Items) != 1 {
			t.Fatalf("got %d items, want 1", len(page.Items))
		}
		if page.Total != 2 || page.Pages != 2 {
			t.Errorf("total=%d pages=%d, want 2 and 2", page.Total, page.Pages)
		}

		second := h.list(t, "?limit=1&page=2", "")
		if len(second.Items) != 1 {
			t.Fatalf("page 2 got %d items, want 1", len(second.Items))
		}
		if second.Items[0].ID == page.Items[0].ID {
			t.Error("page 2 repeated page 1")
		}
	})

	t.Run("unbounded limit is capped", func(t *testing.T) {
		rec := h.do(t, http.MethodGet, "/api/v1/apartments?limit=100000", nil, "")
		if rec.Code != http.StatusBadRequest {
			// Accepted but capped is also fine; what must not happen is an
			// unbounded query.
			var page dto.ApartmentListResponse
			if err := json.Unmarshal(decode(t, rec).Data, &page); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if page.Limit > dto.MaxPageLimit {
				t.Errorf("limit is %d, above the %d cap", page.Limit, dto.MaxPageLimit)
			}
		}
	})
}

func TestDistrictsEndpointServesTheWholeList(t *testing.T) {
	h := newListingHarness(t)

	rec := h.do(t, http.MethodGet, "/api/v1/districts", nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("got status %d, want 200", rec.Code)
	}
	var districts []dto.DistrictResponse
	if err := json.Unmarshal(decode(t, rec).Data, &districts); err != nil {
		t.Fatalf("decode: %v", err)
	}

	// All twelve districts of Tashkent. A missing one is a district no owner
	// can publish in and no searcher can filter by.
	if len(districts) != 12 {
		t.Errorf("got %d districts, want 12", len(districts))
	}
	seen := map[string]bool{}
	for _, district := range districts {
		seen[district.Slug] = true
	}
	for _, slug := range []string{"chilonzor", "sergeli", "uchtepa", "bektemir", "mirzo-ulugbek"} {
		if !seen[slug] {
			t.Errorf("district %q is missing", slug)
		}
	}
}

// uuidString is a well-formed id that names nothing.
func uuidString() string { return "11111111-2222-3333-4444-555555555555" }

// The gallery bug: a listing created with several photographs came back with
// one. Both halves are covered here — that every image is persisted, and that
// the list and the detail responses agree on all of them.
func TestListingKeepsEveryImageAndReturnsThemEverywhere(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)

	body := validListing()
	body["images"] = []map[string]any{
		{"url": "http://localhost:8081/uploads/2026-08/one.jpg"},
		{"url": "http://localhost:8081/uploads/2026-08/two.jpg", "is_primary": true},
		{"url": "http://localhost:8081/uploads/2026-08/three.jpg"},
	}

	status, created := h.create(t, token, body)
	if status != http.StatusCreated {
		t.Fatalf("got status %d, want 201", status)
	}
	if len(created.Images) != 3 {
		t.Fatalf("create returned %d images, want 3", len(created.Images))
	}
	// The cover leads, because that is what a gallery shows first.
	if !created.Images[0].IsPrimary {
		t.Errorf("the first image is not the cover: %+v", created.Images)
	}
	if !strings.HasSuffix(created.Images[0].URL, "two.jpg") {
		t.Errorf("the wrong image is the cover: %s", created.Images[0].URL)
	}

	// The detail response is what the gallery reads.
	rec := h.do(t, http.MethodGet, "/api/v1/apartments/"+created.ID.String(), nil, "")
	var detail dto.ApartmentResponse
	if err := json.Unmarshal(decode(t, rec).Data, &detail); err != nil {
		t.Fatalf("decode detail: %v", err)
	}
	if len(detail.Images) != 3 {
		t.Fatalf("the detail response carries %d images, want 3", len(detail.Images))
	}

	// The card reads the list response, and the two must not disagree — a
	// listing whose photographs appear on the card but not on its own page is
	// exactly the failure this guards against.
	page := h.list(t, "", "")
	var listed *dto.ApartmentResponse
	for i := range page.Items {
		if page.Items[i].ID == created.ID {
			listed = &page.Items[i]
		}
	}
	if listed == nil {
		t.Fatal("the listing is missing from the feed")
	}
	if len(listed.Images) != len(detail.Images) {
		t.Fatalf("list has %d images, detail has %d", len(listed.Images), len(detail.Images))
	}
	for i := range detail.Images {
		if listed.Images[i] != detail.Images[i] {
			t.Errorf("image %d differs: list %+v, detail %+v", i, listed.Images[i], detail.Images[i])
		}
	}
}

// An edit must keep the gallery it was given, not collapse it.
func TestUpdateReplacesTheWholeGallery(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)
	_, created := h.create(t, token, validListing())

	updated := validListing()
	updated["images"] = []map[string]any{
		{"url": "http://localhost:8081/uploads/2026-08/a.jpg", "is_primary": true},
		{"url": "http://localhost:8081/uploads/2026-08/b.jpg"},
	}

	path := "/api/v1/apartments/" + created.ID.String()
	if rec := h.do(t, http.MethodPut, path, updated, token); rec.Code != http.StatusOK {
		t.Fatalf("update got status %d, want 200", rec.Code)
	}

	rec := h.do(t, http.MethodGet, path, nil, "")
	var after dto.ApartmentResponse
	if err := json.Unmarshal(decode(t, rec).Data, &after); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(after.Images) != 2 {
		t.Fatalf("got %d images after the edit, want 2", len(after.Images))
	}
	if !strings.HasSuffix(after.Images[0].URL, "a.jpg") || !after.Images[0].IsPrimary {
		t.Errorf("the new cover was not applied: %+v", after.Images)
	}
}

// Exactly one cover, whatever the client claims: the migration's partial unique
// index allows only one, so two would otherwise fail at the database.
func TestOnlyOneImageEndsUpAsTheCover(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)

	body := validListing()
	body["images"] = []map[string]any{
		{"url": "http://localhost:8081/uploads/2026-08/a.jpg", "is_primary": true},
		{"url": "http://localhost:8081/uploads/2026-08/b.jpg", "is_primary": true},
		{"url": "http://localhost:8081/uploads/2026-08/c.jpg", "is_primary": true},
	}

	status, created := h.create(t, token, body)
	if status != http.StatusCreated {
		t.Fatalf("got status %d, want 201: three covers were rejected outright", status)
	}

	covers := 0
	for _, image := range created.Images {
		if image.IsPrimary {
			covers++
		}
	}
	if covers != 1 {
		t.Errorf("got %d covers, want exactly 1", covers)
	}
}

// A listing with no photographs is still a listing; the response must carry an
// empty array rather than null, which the client maps over without a guard.
func TestListingWithoutImagesReturnsAnEmptyArray(t *testing.T) {
	h := newListingHarness(t)
	token, _ := h.signUp(t)

	body := validListing()
	delete(body, "images")

	status, created := h.create(t, token, body)
	if status != http.StatusCreated {
		t.Fatalf("got status %d, want 201", status)
	}
	if created.Images == nil {
		t.Error("images is null; the client maps over it and would throw")
	}
	if len(created.Images) != 0 {
		t.Errorf("got %d images, want none", len(created.Images))
	}
}
