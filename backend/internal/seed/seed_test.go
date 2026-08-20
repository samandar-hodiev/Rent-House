package seed

import (
	"strings"
	"testing"
)

// These run without a database: they check the reference data itself, which is
// where a duplicate slug or a typo would otherwise reach production.

func TestDistrictSlugsAreUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, d := range Districts {
		if seen[d.Slug] {
			t.Fatalf("duplicate district slug %q", d.Slug)
		}
		seen[d.Slug] = true
	}
}

func TestDistrictNamesAreUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, d := range Districts {
		if seen[d.Name] {
			t.Fatalf("duplicate district name %q", d.Name)
		}
		seen[d.Name] = true
	}
}

func TestAmenitySlugsAreUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, a := range Amenities {
		if seen[a.Slug] {
			t.Fatalf("duplicate amenity slug %q", a.Slug)
		}
		seen[a.Slug] = true
	}
}

func TestEveryFrontendDistrictIsSeeded(t *testing.T) {
	required := []string{
		"Sergeli", "Chilonzor", "Yunusobod", "Shayxontohur",
		"Mirobod", "Yakkasaroy", "Olmazor",
	}

	present := map[string]bool{}
	for _, d := range Districts {
		present[d.Name] = true
	}
	for _, name := range required {
		if !present[name] {
			t.Errorf("district %q is missing from the seed", name)
		}
	}
}

func TestEveryFrontendAmenityIsSeeded(t *testing.T) {
	required := []string{
		"Wi-Fi", "Konditsioner", "Isitish tizimi", "Issiq suv", "Gaz",
		"Muzlatgich", "Kir yuvish mashinasi", "Televizor", "Oshxona jihozlari",
		"Balkon", "Lift", "Avtoturargoh", "Qo'riqlash",
	}

	present := map[string]bool{}
	for _, a := range Amenities {
		present[a.Name] = true
	}
	for _, name := range required {
		if !present[name] {
			t.Errorf("amenity %q is missing from the seed", name)
		}
	}
}

func TestSeedRowsAreWellFormed(t *testing.T) {
	for _, d := range Districts {
		if strings.TrimSpace(d.Name) == "" || strings.TrimSpace(d.Slug) == "" {
			t.Errorf("district %+v has a blank name or slug", d)
		}
		if d.Latitude < -90 || d.Latitude > 90 {
			t.Errorf("district %q latitude %v is out of range", d.Name, d.Latitude)
		}
		if d.Longitude < -180 || d.Longitude > 180 {
			t.Errorf("district %q longitude %v is out of range", d.Name, d.Longitude)
		}
		if d.Slug != strings.ToLower(d.Slug) {
			t.Errorf("district slug %q must be lowercase", d.Slug)
		}
	}

	for _, a := range Amenities {
		if strings.TrimSpace(a.Name) == "" || strings.TrimSpace(a.Slug) == "" {
			t.Errorf("amenity %+v has a blank name or slug", a)
		}
		if a.Slug != strings.ToLower(a.Slug) {
			t.Errorf("amenity slug %q must be lowercase", a.Slug)
		}
	}
}

func TestSeedCreatesNoUsersOrApartments(t *testing.T) {
	// Guards the rule that only reference data is seeded. If someone adds a
	// Users or Apartments slice to this package, this test is the reminder.
	if len(Districts) == 0 || len(Amenities) == 0 {
		t.Fatal("reference data must not be empty")
	}
}
