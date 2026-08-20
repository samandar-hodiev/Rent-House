package dto

import (
	"regexp"

	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
)

// uzPhonePattern matches an Uzbek mobile number in international form:
// +998 followed by nine digits. Storing one canonical shape keeps the unique
// constraint meaningful — otherwise +998901234567 and 998901234567 would be
// two different accounts.
var uzPhonePattern = regexp.MustCompile(`^\+998\d{9}$`)

// RegisterValidators teaches Gin's validator the `uzphone` rule. It is called
// once at startup; calling it again is harmless.
func RegisterValidators() error {
	engine, ok := binding.Validator.Engine().(*validator.Validate)
	if !ok {
		return nil
	}
	return engine.RegisterValidation("uzphone", func(fl validator.FieldLevel) bool {
		return uzPhonePattern.MatchString(fl.Field().String())
	})
}

// IsValidUzPhone reports whether a phone number is in the accepted form.
func IsValidUzPhone(phone string) bool { return uzPhonePattern.MatchString(phone) }
