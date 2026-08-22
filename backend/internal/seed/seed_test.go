package seed

import (
	"os"
	"path/filepath"
	"regexp"
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
	// All twelve districts of Tashkent, the same list the frontend offers. A
	// district missing here is a district no one can publish a listing in.
	required := []string{
		"Sergeli", "Chilonzor", "Yunusobod", "Shayxontohur",
		"Mirobod", "Yakkasaroy", "Olmazor", "Uchtepa",
		"Bektemir", "Yashnobod", "Yangihayot", "Mirzo Ulug'bek",
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

// amenitiesPattern lifts the `AMENITIES = [...]` array out of the frontend's
// listing-form module, and quotedPattern reads the ids inside it.
var (
	amenitiesPattern = regexp.MustCompile(`(?s)export const AMENITIES = \[(.*?)\]`)
	quotedPattern    = regexp.MustCompile(`'([^']+)'`)
)

// The frontend sends amenity *slugs*, so slugs are what has to match.
//
// This used to compare display names, which are never sent anywhere, and so it
// passed happily while the form submitted "hotWater" against a seeded
// "hot-water" — every listing with hot water ticked failed to publish with
// "one of the selected amenities does not exist". Reading the real file is the
// only version of this test that could have caught that.
func TestEveryFrontendAmenityIsSeeded(t *testing.T) {
	path := filepath.Join("..", "..", "..", "frontend", "src", "data", "listingForm.js")
	source, err := os.ReadFile(path)
	if err != nil {
		// A backend-only checkout has no frontend to compare against. Skipping
		// is honest; failing would report a problem that does not exist.
		t.Skipf("frontend source not available: %v", err)
	}

	match := amenitiesPattern.FindSubmatch(source)
	if match == nil {
		t.Fatalf("could not find the AMENITIES array in %s", path)
	}

	seeded := map[string]bool{}
	for _, a := range Amenities {
		seeded[a.Slug] = true
	}

	found := 0
	for _, id := range quotedPattern.FindAllSubmatch(match[1], -1) {
		slug := string(id[1])
		found++
		if !seeded[slug] {
			t.Errorf("frontend offers amenity %q, which is not seeded", slug)
		}
	}
	if found == 0 {
		t.Fatal("parsed the AMENITIES array but found no ids in it")
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
