package dto

import (
	"regexp"
	"strings"

	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
)

// uzPhonePattern matches an Uzbek mobile number in international form: +998
// followed by nine digits. Storing one canonical shape is what makes the unique
// constraint meaningful — otherwise +998901234567 and 998 90 123 45 67 would be
// two different accounts.
var uzPhonePattern = regexp.MustCompile(`^\+998\d{9}$`)

// separators users type but that carry no meaning.
var phoneCleaner = strings.NewReplacer(" ", "", "-", "", "(", "", ")", "")

// NormalizeUzPhone converts the shapes people actually type into the canonical
// +998XXXXXXXXX form:
//
//	+998 90 123 45 67  ->  +998901234567
//	998901234567       ->  +998901234567
//	901234567          ->  +998901234567
//
// An input that cannot be read as an Uzbek mobile number is returned empty, so
// the caller's validation rejects it rather than storing something malformed.
func NormalizeUzPhone(phone string) string {
	cleaned := phoneCleaner.Replace(strings.TrimSpace(phone))
	if cleaned == "" {
		return ""
	}

	switch {
	case strings.HasPrefix(cleaned, "+998"):
		// already international
	case strings.HasPrefix(cleaned, "998") && len(cleaned) == 12:
		cleaned = "+" + cleaned
	case len(cleaned) == 9:
		// a local number, missing the country code
		cleaned = "+998" + cleaned
	}

	if !uzPhonePattern.MatchString(cleaned) {
		return ""
	}
	return cleaned
}

// IsValidUzPhone reports whether a phone number is already in canonical form.
func IsValidUzPhone(phone string) bool { return uzPhonePattern.MatchString(phone) }

// RegisterValidators teaches Gin's validator the `uzphone` rule. It is called
// once at startup; calling it again is harmless.
func RegisterValidators() error {
	engine, ok := binding.Validator.Engine().(*validator.Validate)
	if !ok {
		return nil
	}
	return engine.RegisterValidation("uzphone", func(fl validator.FieldLevel) bool {
		// Accept anything that normalizes to a valid number, so the binding
		// layer does not reject a number the service would happily accept.
		return NormalizeUzPhone(fl.Field().String()) != ""
	})
}
