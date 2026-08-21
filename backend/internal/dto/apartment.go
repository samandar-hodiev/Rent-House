package dto

import (
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// Pagination defaults for the listings feed. An unbounded query is a denial of
// service waiting to happen once the table is large, so a limit is always
// applied even when the client asks for none.
const (
	DefaultPageLimit = 20
	MaxPageLimit     = 60
)

// ApartmentImageInput is one picture in the gallery the owner submitted.
//
// The URL comes from the upload endpoint, which is what actually stores the
// file; this only records which stored files belong to the listing and in what
// order.
type ApartmentImageInput struct {
	URL       string `json:"url"        binding:"required,url,max=2048"`
	IsPrimary bool   `json:"is_primary"`
}

// ApartmentWriteRequest is the body of POST and PUT /api/v1/apartments.
//
// One shape for both: the owner form submits every field on create and on edit,
// so a separate partial-update type would only be a second thing to keep in
// step. `owner_id` is deliberately absent — it comes from the authenticated
// token, never from the client.
type ApartmentWriteRequest struct {
	Title       string `json:"title"       binding:"required,min=10,max=255"`
	Description string `json:"description" binding:"omitempty,max=5000"`

	// A string, not a number: prices reach the millions of so'm, and JSON
	// numbers are float64, which cannot hold every such value exactly.
	Price        string `json:"price"         binding:"required,numeric"`
	Currency     string `json:"currency"      binding:"required,oneof=UZS USD"`
	RentalPeriod string `json:"rental_period" binding:"required,oneof=monthly daily"`

	Rooms       int16 `json:"rooms"        binding:"required,min=1,max=20"`
	Area        int32 `json:"area"         binding:"required,min=1,max=10000"`
	Floor       int16 `json:"floor"        binding:"required,min=1,max=200"`
	TotalFloors int16 `json:"total_floors" binding:"required,min=1,max=200"`
	Furnished   bool  `json:"furnished"`

	// The slug the frontend already uses ("chilonzor"), resolved to the
	// district's id by the service. The client never sees a district uuid.
	DistrictSlug string  `json:"district_slug" binding:"required,max=60"`
	Neighborhood string  `json:"neighborhood"  binding:"omitempty,max=120"`
	Address      string  `json:"address"       binding:"required,min=5,max=255"`
	Latitude     float64 `json:"latitude"     binding:"required,latitude"`
	Longitude    float64 `json:"longitude"    binding:"required,longitude"`

	Deposit       string   `json:"deposit"        binding:"omitempty,numeric"`
	Utilities     string   `json:"utilities"      binding:"omitempty,oneof=INCLUDED SEPARATE"`
	MinimumMonths *int16   `json:"minimum_months" binding:"omitempty,min=1,max=60"`
	Rules         []string `json:"rules"        binding:"omitempty,max=20,dive,max=40"`

	Amenities []string              `json:"amenities" binding:"omitempty,max=40,dive,max=40"`
	Images    []ApartmentImageInput `json:"images"    binding:"omitempty,max=20,dive"`

	// Publish decides whether the listing goes live or is kept as a draft. A
	// boolean rather than a free-text status: the client may choose between
	// those two outcomes and nothing else, so it cannot set "closed" or invent
	// a value.
	Publish bool `json:"publish"`
}

// Normalize trims and lowercases the values that identify something, so
// "Chilonzor " and "chilonzor" resolve to one district.
func (r *ApartmentWriteRequest) Normalize() {
	r.Title = strings.TrimSpace(r.Title)
	r.Description = strings.TrimSpace(r.Description)
	r.Address = strings.TrimSpace(r.Address)
	r.Neighborhood = strings.TrimSpace(r.Neighborhood)
	r.DistrictSlug = strings.ToLower(strings.TrimSpace(r.DistrictSlug))
	r.Price = strings.TrimSpace(r.Price)
	r.Deposit = strings.TrimSpace(r.Deposit)

	if r.Utilities == "" {
		r.Utilities = models.UtilitiesIncluded
	}

	r.Amenities = normalizeSlugs(r.Amenities)
	r.Rules = normalizeSlugs(r.Rules)
}

// normalizeSlugs lowercases, trims and de-duplicates, so a repeated amenity in
// the request cannot produce a repeated row.
func normalizeSlugs(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	seen := make(map[string]bool, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		slug := strings.ToLower(strings.TrimSpace(value))
		if slug == "" || seen[slug] {
			continue
		}
		seen[slug] = true
		out = append(out, slug)
	}
	return out
}

// ApartmentListQuery is the query string of GET /api/v1/apartments.
//
// Everything is optional; an empty query returns the newest active listings.
type ApartmentListQuery struct {
	District  string  `form:"district"`
	Keyword   string  `form:"keyword"`
	MinPrice  string  `form:"min_price"  binding:"omitempty,numeric"`
	MaxPrice  string  `form:"max_price"  binding:"omitempty,numeric"`
	Rooms     []int16 `form:"rooms"     binding:"omitempty,max=10,dive,min=1,max=20"`
	Furnished *bool   `form:"furnished"`
	Sort      string  `form:"sort"       binding:"omitempty,oneof=newest price_asc price_desc"`
	Page      int     `form:"page"       binding:"omitempty,min=1"`
	Limit     int     `form:"limit"      binding:"omitempty,min=1,max=60"`
}

// Normalize applies the defaults and caps the page size.
func (q *ApartmentListQuery) Normalize() {
	q.District = strings.ToLower(strings.TrimSpace(q.District))
	q.Keyword = strings.TrimSpace(q.Keyword)
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 {
		q.Limit = DefaultPageLimit
	}
	if q.Limit > MaxPageLimit {
		q.Limit = MaxPageLimit
	}
}

// Offset is the row to start at, derived from the page and limit.
func (q *ApartmentListQuery) Offset() int { return (q.Page - 1) * q.Limit }

// --- responses -------------------------------------------------------------

// DistrictResponse is the district as a listing carries it. The frontend keys
// its translations off the slug, so that is what it needs, not the uuid.
type DistrictResponse struct {
	Slug      string  `json:"slug"`
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// ApartmentOwnerResponse is the public view of an owner: enough to contact
// them, and nothing else. No email unless they published one, no id-adjacent
// account detail, never a password hash.
type ApartmentOwnerResponse struct {
	ID    uuid.UUID `json:"id"`
	Name  string    `json:"name"`
	Phone string    `json:"phone,omitempty"`
}

// ApartmentImageResponse is one gallery picture.
type ApartmentImageResponse struct {
	URL       string `json:"url"`
	IsPrimary bool   `json:"is_primary"`
}

// ApartmentResponse is a listing as the API returns it.
//
// Built field by field from the model rather than serialising the model: a
// column added later — an internal note, a moderation flag — must not appear in
// a public response just because someone added it to the struct.
type ApartmentResponse struct {
	ID uuid.UUID `json:"id"`

	Title       string `json:"title"`
	Description string `json:"description"`

	Price        string `json:"price"`
	Currency     string `json:"currency"`
	RentalPeriod string `json:"rental_period"`

	Rooms       int16 `json:"rooms"`
	Area        int32 `json:"area"`
	Floor       int16 `json:"floor"`
	TotalFloors int16 `json:"total_floors"`
	Furnished   bool  `json:"furnished"`

	Status string `json:"status"`

	District     *DistrictResponse `json:"district,omitempty"`
	Neighborhood string            `json:"neighborhood,omitempty"`
	Address      string            `json:"address"`
	Latitude     float64           `json:"latitude"`
	Longitude    float64           `json:"longitude"`

	Deposit       string   `json:"deposit,omitempty"`
	Utilities     string   `json:"utilities"`
	MinimumMonths *int16   `json:"minimum_months,omitempty"`
	Rules         []string `json:"rules"`

	Amenities []string                 `json:"amenities"`
	Images    []ApartmentImageResponse `json:"images"`

	ViewsCount int64                   `json:"views_count"`
	Owner      *ApartmentOwnerResponse `json:"owner,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ApartmentListResponse is a page of listings plus what the pager needs.
type ApartmentListResponse struct {
	Items []ApartmentResponse `json:"items"`
	Total int64               `json:"total"`
	Page  int                 `json:"page"`
	Limit int                 `json:"limit"`
	// Pages is precomputed so the client does not have to repeat the ceiling
	// division and risk disagreeing with the server about the last page.
	Pages int `json:"pages"`
}

// NewApartmentResponse converts a model into its API shape.
//
// `includeOwnerContact` is false for the public feed — a phone number on every
// card is a scraping target — and true on the detail page, where contacting the
// owner is the point.
func NewApartmentResponse(apartment *models.Apartment, includeOwnerContact bool) ApartmentResponse {
	out := ApartmentResponse{
		ID:            apartment.ID,
		Title:         apartment.Title,
		Description:   apartment.Description,
		Price:         apartment.Price.String(),
		Currency:      apartment.Currency,
		RentalPeriod:  apartment.RentalPeriod,
		Rooms:         apartment.Rooms,
		Area:          apartment.Area,
		Floor:         apartment.Floor,
		TotalFloors:   apartment.TotalFloors,
		Furnished:     apartment.Furnished,
		Status:        apartment.Status,
		Address:       apartment.Address,
		Latitude:      apartment.Latitude,
		Longitude:     apartment.Longitude,
		Utilities:     apartment.Utilities,
		MinimumMonths: apartment.MinimumMonths,
		ViewsCount:    apartment.ViewsCount,
		CreatedAt:     apartment.CreatedAt,
		UpdatedAt:     apartment.UpdatedAt,
		// Never nil: the client renders these with .map(), and a null would
		// force a guard at every call site.
		Rules:     []string{},
		Amenities: []string{},
		Images:    []ApartmentImageResponse{},
	}

	if apartment.Neighborhood != nil {
		out.Neighborhood = *apartment.Neighborhood
	}
	if apartment.Deposit != nil {
		out.Deposit = apartment.Deposit.String()
	}
	if len(apartment.Rules) > 0 {
		out.Rules = []string(apartment.Rules)
	}

	if apartment.District != nil {
		out.District = &DistrictResponse{
			Slug:      apartment.District.Slug,
			Name:      apartment.District.Name,
			Latitude:  apartment.District.Latitude,
			Longitude: apartment.District.Longitude,
		}
	}

	for _, amenity := range apartment.Amenities {
		out.Amenities = append(out.Amenities, amenity.Slug)
	}
	for _, image := range apartment.Images {
		out.Images = append(out.Images, ApartmentImageResponse{
			URL:       image.URL,
			IsPrimary: image.IsPrimary,
		})
	}

	if apartment.Owner != nil {
		owner := &ApartmentOwnerResponse{
			ID:   apartment.Owner.ID,
			Name: strings.TrimSpace(apartment.Owner.FirstName + " " + apartment.Owner.LastName),
		}
		if includeOwnerContact && apartment.Owner.Phone != nil {
			owner.Phone = *apartment.Owner.Phone
		}
		out.Owner = owner
	}

	return out
}

// ParsePositiveDecimal reads a money value from the request.
//
// Returns ok=false for anything that is not a number or is not above zero, so
// the caller reports a validation error rather than letting a CHECK constraint
// surface as a 500.
func ParsePositiveDecimal(value string) (decimal.Decimal, bool) {
	amount, err := decimal.NewFromString(value)
	if err != nil || !amount.IsPositive() {
		return decimal.Decimal{}, false
	}
	return amount, true
}

// ParseNonNegativeDecimal is the same for a deposit, where zero is meaningful.
func ParseNonNegativeDecimal(value string) (decimal.Decimal, bool) {
	amount, err := decimal.NewFromString(value)
	if err != nil || amount.IsNegative() {
		return decimal.Decimal{}, false
	}
	return amount, true
}
