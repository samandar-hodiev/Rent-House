package models

// Language options offered by the frontend.
const (
	LanguageUz = "uz"
	LanguageRu = "ru"
	LanguageEn = "en"
)

// Theme options offered by the frontend.
const (
	ThemeLight = "light"
	ThemeDark  = "dark"
)

// Languages and Themes list the accepted values, for validation in the service
// layer and for the CHECK constraints in the migration.
var (
	Languages = []string{LanguageUz, LanguageRu, LanguageEn}
	Themes    = []string{ThemeLight, ThemeDark}
)

// User is an account. There is no role column: a RentHouse user both searches
// for apartments and publishes their own, so ownership is expressed by
// Apartment.OwnerID rather than by a role.
type User struct {
	Base
	FirstName string `gorm:"column:first_name;type:varchar(100);not null" json:"first_name"`
	LastName  string `gorm:"column:last_name;type:varchar(100);not null" json:"last_name"`
	Email     string `gorm:"column:email;type:varchar(255);not null;uniqueIndex:uq_users_email" json:"email"`
	Phone     string `gorm:"column:phone;type:varchar(32);not null;uniqueIndex:uq_users_phone" json:"phone"`

	// PasswordHash is tagged json:"-" so it can never leave through a handler
	// that marshals a User directly. Hashing arrives with the auth phase.
	PasswordHash string `gorm:"column:password_hash;type:varchar(255);not null" json:"-"`

	AvatarURL *string `gorm:"column:avatar_url;type:text" json:"avatar_url,omitempty"`
	Language  string  `gorm:"column:language;type:varchar(2);not null;default:uz" json:"language"`
	Theme     string  `gorm:"column:theme;type:varchar(5);not null;default:light" json:"theme"`

	Timestamps

	Apartments []Apartment `gorm:"foreignKey:OwnerID" json:"apartments,omitempty"`
	Favorites  []Favorite  `gorm:"foreignKey:UserID" json:"favorites,omitempty"`
	Messages   []Message   `gorm:"foreignKey:SenderID" json:"messages,omitempty"`
}

func (User) TableName() string { return "users" }
