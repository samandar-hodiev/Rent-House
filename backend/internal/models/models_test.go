package models

import "testing"

// The constants are mirrored by CHECK constraints in the migrations. These
// tests catch a value being added in Go without the constraint being widened.
//
// The expected sets below are the *current* schema, which is not always what
// 0001 created: a later migration can redefine a constraint, and the value
// listed here has to follow it. `deleted` arrived that way in
// 0014_apartment_deleted_status.

func assertUnique(t *testing.T, label string, values []string) {
	t.Helper()
	seen := map[string]bool{}
	for _, v := range values {
		if v == "" {
			t.Errorf("%s contains an empty value", label)
		}
		if seen[v] {
			t.Errorf("%s contains a duplicate value %q", label, v)
		}
		seen[v] = true
	}
}

func TestEnumValuesAreUnique(t *testing.T) {
	assertUnique(t, "Languages", Languages)
	assertUnique(t, "Themes", Themes)
	assertUnique(t, "Currencies", Currencies)
	assertUnique(t, "RentalPeriods", RentalPeriods)
	assertUnique(t, "ApartmentStatuses", ApartmentStatuses)
}

func TestEnumValuesMatchTheDatabaseCheckConstraints(t *testing.T) {
	cases := []struct {
		label string
		got   []string
		want  []string
	}{
		{"Languages", Languages, []string{"uz", "ru", "en"}},
		{"Themes", Themes, []string{"light", "dark"}},
		{"Currencies", Currencies, []string{"UZS", "USD"}},
		{"RentalPeriods", RentalPeriods, []string{"monthly", "daily"}},
		// Widened by 0014_apartment_deleted_status.
		{"ApartmentStatuses", ApartmentStatuses, []string{"draft", "pending", "active", "closed", "deleted"}},
	}

	for _, c := range cases {
		if len(c.got) != len(c.want) {
			t.Errorf("%s has %d values, the CHECK constraint allows %d", c.label, len(c.got), len(c.want))
			continue
		}
		allowed := map[string]bool{}
		for _, v := range c.want {
			allowed[v] = true
		}
		for _, v := range c.got {
			if !allowed[v] {
				t.Errorf("%s value %q is not in the database CHECK constraint", c.label, v)
			}
		}
	}
}

func TestTableNamesArePinned(t *testing.T) {
	cases := map[string]string{
		User{}.TableName():                    "users",
		District{}.TableName():                "districts",
		Amenity{}.TableName():                 "amenities",
		Apartment{}.TableName():               "apartments",
		ApartmentImage{}.TableName():          "apartment_images",
		ApartmentAmenity{}.TableName():        "apartment_amenities",
		Favorite{}.TableName():                "favorites",
		Conversation{}.TableName():            "conversations",
		ConversationParticipant{}.TableName(): "conversation_participants",
		Message{}.TableName():                 "messages",
	}

	if len(cases) != 10 {
		t.Fatalf("expected 10 distinct table names, got %d", len(cases))
	}
	for got, want := range cases {
		if got != want {
			t.Errorf("got table name %q, want %q", got, want)
		}
	}
}
