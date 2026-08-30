package service

import (
	"reflect"
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// The registry and the Settings struct must describe the same set. A field with
// no declaration would never be stored; a declaration with no field would never
// be read. Both are silent failures at runtime, so they fail here instead.
func TestSettingsStructMatchesRegistry(t *testing.T) {
	fields := map[string]reflect.Kind{}
	structType := reflect.TypeOf(Settings{})
	for i := 0; i < structType.NumField(); i++ {
		field := structType.Field(i)
		key := field.Tag.Get("setting")
		if key == "" {
			t.Fatalf("field %s has no setting tag", field.Name)
		}
		if _, seen := fields[key]; seen {
			t.Fatalf("two fields claim the key %q", key)
		}
		fields[key] = field.Type.Kind()
	}

	for _, def := range models.SettingDefs {
		kind, ok := fields[def.Key]
		if !ok {
			t.Errorf("%s is declared but no field reads it", def.Key)
			continue
		}
		want := map[models.SettingType]reflect.Kind{
			models.SettingBool:   reflect.Bool,
			models.SettingInt:    reflect.Int,
			models.SettingString: reflect.String,
			models.SettingJSON:   reflect.Slice,
		}[def.Type]
		if kind != want {
			t.Errorf("%s is declared %s but its field is %s", def.Key, def.Type, kind)
		}
		delete(fields, def.Key)
	}
	for key := range fields {
		t.Errorf("%s has a field but no declaration", key)
	}
}

// Every declared default must survive its own validation. A default that the
// registry would refuse is a marketplace that cannot start from empty.
func TestDeclaredDefaultsAreValid(t *testing.T) {
	for _, def := range models.SettingDefs {
		if def.Key == models.SettingSiteLogoURL || def.Key == models.SettingSiteFaviconURL {
			// Empty is the point: no logo has been uploaded yet.
			continue
		}
		if _, err := normalizeSetting(def, def.Default); err != nil {
			t.Errorf("default for %s is not valid: %v", def.Key, err)
		}
	}
}

// Defaults() is what a fresh database behaves by, so it must be fully filled in
// rather than a zero value pretending to be a configuration.
func TestDefaultsAreFilled(t *testing.T) {
	defaults := Defaults()
	if defaults.SiteName == "" || defaults.ListingMaxImages == 0 || defaults.Timezone == "" {
		t.Fatalf("defaults are not populated: %+v", defaults)
	}
	if !defaults.ChatEnabled || !defaults.UserRegistrationEnabled {
		t.Fatal("the marketplace must default to open")
	}
	if defaults.MaintenanceMode {
		t.Fatal("the marketplace must not default to closed")
	}
}
