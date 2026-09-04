//go:build integration

// The filters the search page sends, answered by PostgreSQL.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run Filters
//
// These exist because the same filters used to be applied in the browser over
// one page of results: the numbers on screen were then a count of what had been
// fetched rather than of what matches, and with real pagination that is simply
// wrong. Read-only, inside a rolled-back transaction, so the suite can be
// pointed at a populated database.
package handler

import (
	"fmt"
	"net/http"
	"testing"
)

// listFiltered asks the public endpoint and returns the total and the rows.
func listFiltered(t *testing.T, h *adminHarness, query string) (int, []map[string]any) {
	t.Helper()

	status, body := doPublic(t, h.publicRouter(t), http.MethodGet, "/api/v1/apartments?"+query)
	if status != http.StatusOK {
		t.Fatalf("%s: got %d, want 200 (%v)", query, status, body)
	}
	data, _ := body["data"].(map[string]any)
	items, _ := data["items"].([]any)

	rows := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if row, ok := item.(map[string]any); ok {
			rows = append(rows, row)
		}
	}
	total, _ := data["total"].(float64)
	return int(total), rows
}

func TestApartmentFiltersAreAppliedByTheDatabase(t *testing.T) {
	h := newAdminHarness(t)

	all, _ := listFiltered(t, h, "limit=1")
	if all == 0 {
		t.Skip("no published listings to filter")
	}

	t.Run("area", func(t *testing.T) {
		_, rows := listFiltered(t, h, "limit=60&min_area=60&max_area=80")
		if len(rows) == 0 {
			t.Skip("no listing in that size range")
		}
		for _, row := range rows {
			area := row["area"].(float64)
			if area < 60 || area > 80 {
				t.Errorf("area %v is outside 60-80", area)
			}
		}
	})

	t.Run("floor bands", func(t *testing.T) {
		bands := map[string][2]float64{
			"low":  {1, 5},
			"mid":  {6, 10},
			"high": {11, 1000},
		}
		for band, bounds := range bands {
			_, rows := listFiltered(t, h, "limit=60&floor="+band)
			for _, row := range rows {
				floor := row["floor"].(float64)
				if floor < bounds[0] || floor > bounds[1] {
					t.Errorf("floor %v is outside the %s band", floor, band)
				}
			}
		}
	})

	t.Run("rooms_min is four or more", func(t *testing.T) {
		_, rows := listFiltered(t, h, "limit=60&rooms_min=4")
		for _, row := range rows {
			if rooms := row["rooms"].(float64); rooms < 4 {
				t.Errorf("rooms %v is below the minimum", rooms)
			}
		}
	})

	t.Run("area ordering", func(t *testing.T) {
		_, rows := listFiltered(t, h, "limit=10&sort=area_desc")
		for i := 1; i < len(rows); i++ {
			if rows[i-1]["area"].(float64) < rows[i]["area"].(float64) {
				t.Fatalf("area_desc is not descending: %v then %v",
					rows[i-1]["area"], rows[i]["area"])
			}
		}
	})

	t.Run("the total counts matches, not the page", func(t *testing.T) {
		total, rows := listFiltered(t, h, "limit=5")
		if total < len(rows) {
			t.Fatalf("total %d is smaller than the page it returned (%d)", total, len(rows))
		}
		// A second page exists exactly when the total says so.
		_, second := listFiltered(t, h, "limit=5&page=2")
		if total > 5 && len(second) == 0 {
			t.Fatal("the total promises a second page that is empty")
		}
	})

	t.Run("a filter the server does not know is refused", func(t *testing.T) {
		status, _ := doPublic(t, h.publicRouter(t), http.MethodGet,
			"/api/v1/apartments?floor=basement")
		if status != http.StatusBadRequest {
			t.Fatalf("got %d, want 400", status)
		}
	})

	t.Run("filters narrow the total", func(t *testing.T) {
		wide, _ := listFiltered(t, h, "limit=1")
		narrow, _ := listFiltered(t, h, "limit=1&"+fmt.Sprintf("min_area=%d", 1000))
		if narrow > wide {
			t.Fatalf("a narrower search returned more: %d vs %d", narrow, wide)
		}
	})
}
