// Package seed inserts reference data — the fixed districts and amenities the
// application needs in order to function.
//
// It deliberately creates no users and no apartments: those are real content,
// not reference data, and fabricating them would put fake listings in a real
// database.
package seed

import (
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

// Districts of Tashkent, with their approximate centre points.
// Slugs match the ids the frontend already uses, so the two line up when the
// API replaces the frontend's static district list.
var Districts = []models.District{
	{Name: "Sergeli", Slug: "sergeli", Latitude: 41.2270, Longitude: 69.2607},
	{Name: "Chilonzor", Slug: "chilonzor", Latitude: 41.2758, Longitude: 69.2044},
	{Name: "Yunusobod", Slug: "yunusobod", Latitude: 41.3620, Longitude: 69.2887},
	{Name: "Shayxontohur", Slug: "shayxontohur", Latitude: 41.3167, Longitude: 69.2394},
	{Name: "Mirobod", Slug: "mirobod", Latitude: 41.2846, Longitude: 69.2705},
	{Name: "Yakkasaroy", Slug: "yakkasaroy", Latitude: 41.2814, Longitude: 69.2447},
	{Name: "Olmazor", Slug: "olmazor", Latitude: 41.3448, Longitude: 69.2211},
	{Name: "Uchtepa", Slug: "uchtepa", Latitude: 41.2884, Longitude: 69.1783},
	{Name: "Bektemir", Slug: "bektemir", Latitude: 41.2181, Longitude: 69.3339},
	{Name: "Yashnobod", Slug: "yashnobod", Latitude: 41.2860, Longitude: 69.3210},
	{Name: "Yangihayot", Slug: "yangihayot", Latitude: 41.2093, Longitude: 69.2246},
	{Name: "Mirzo Ulug'bek", Slug: "mirzo-ulugbek", Latitude: 41.3253, Longitude: 69.3350},
}

// Amenities an apartment can offer. Names are the Uzbek labels shown in the UI;
// slugs are the stable identifiers the API and the frontend agree on.
var Amenities = []models.Amenity{
	{Name: "Wi-Fi", Slug: "wifi", Icon: ptr("wifi")},
	{Name: "Konditsioner", Slug: "ac", Icon: ptr("air-vent")},
	{Name: "Isitish tizimi", Slug: "heating", Icon: ptr("thermometer")},
	{Name: "Issiq suv", Slug: "hot-water", Icon: ptr("droplets")},
	{Name: "Gaz", Slug: "gas", Icon: ptr("flame")},
	{Name: "Muzlatgich", Slug: "fridge", Icon: ptr("refrigerator")},
	{Name: "Kir yuvish mashinasi", Slug: "washer", Icon: ptr("washing-machine")},
	{Name: "Televizor", Slug: "tv", Icon: ptr("tv")},
	{Name: "Oshxona jihozlari", Slug: "kitchen", Icon: ptr("cooking-pot")},
	{Name: "Balkon", Slug: "balcony", Icon: ptr("panel-top")},
	{Name: "Lift", Slug: "elevator", Icon: ptr("arrow-up-down")},
	{Name: "Avtoturargoh", Slug: "parking", Icon: ptr("car")},
	{Name: "Qo'riqlash", Slug: "security", Icon: ptr("shield-check")},
}

func ptr(s string) *string { return &s }

// Result reports what a run did.
type Result struct {
	DistrictsInserted int64
	AmenitiesInserted int64
}

// Run inserts any missing reference rows and leaves existing ones untouched.
//
// Idempotence comes from the database, not from a read-then-write check:
// ON CONFLICT DO NOTHING against the unique slug means a second run inserts
// nothing, and two concurrent runs cannot race into a duplicate.
//
// Rows already present are not updated, so a value edited in the database by
// hand is not silently reverted by the next deploy.
func Run(db *gorm.DB) (Result, error) {
	var result Result

	districts := append([]models.District(nil), Districts...)
	tx := db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "slug"}},
		DoNothing: true,
	}).Create(&districts)
	if tx.Error != nil {
		return result, fmt.Errorf("seed districts: %w", tx.Error)
	}
	result.DistrictsInserted = tx.RowsAffected

	amenities := append([]models.Amenity(nil), Amenities...)
	tx = db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "slug"}},
		DoNothing: true,
	}).Create(&amenities)
	if tx.Error != nil {
		return result, fmt.Errorf("seed amenities: %w", tx.Error)
	}
	result.AmenitiesInserted = tx.RowsAffected

	logger.Infof(
		"seed complete: %d districts inserted, %d amenities inserted",
		result.DistrictsInserted, result.AmenitiesInserted,
	)
	return result, nil
}
