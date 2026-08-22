package dto

// FavoriteListResponse is the user's saved listings.
//
// `saved_ids` accompanies them so a client can render the heart on every card
// it already holds without asking again per listing.
type FavoriteListResponse struct {
	Items    []ApartmentResponse `json:"items"`
	Total    int64               `json:"total"`
	SavedIDs []string            `json:"saved_ids"`
}

// DashboardCounts are the three figures at the top of the dashboard.
type DashboardCounts struct {
	ActiveListings  int64 `json:"active_listings"`
	TotalListings   int64 `json:"total_listings"`
	UnreadMessages  int64 `json:"unread_messages"`
	SavedApartments int64 `json:"saved_apartments"`
}

// DashboardSummaryResponse is everything the dashboard's first paint needs.
//
// One response rather than four requests: the page shows three counters and two
// short lists, and fetching them separately would mean four round trips before
// anything above the fold is correct. The lists are capped server-side — the
// dashboard shows three of each, so three is what it receives.
type DashboardSummaryResponse struct {
	Counts DashboardCounts `json:"counts"`

	// RecentListings are the user's own, newest first, in any status — a draft
	// is exactly what an owner comes to the dashboard to find.
	RecentListings []ApartmentResponse `json:"recent_listings"`
	// RecentSaved are the listings they saved, most recently saved first.
	RecentSaved []ApartmentResponse `json:"recent_saved"`
}
