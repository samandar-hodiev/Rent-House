package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

// ErrApartmentNotFound is returned instead of gorm.ErrRecordNotFound so callers
// do not have to import GORM to handle a missing row.
var ErrApartmentNotFound = errors.New("apartment not found")

// ErrDistrictNotFound means the listing referenced a district that does not
// exist. It comes back as a validation failure, not a server error.
var ErrDistrictNotFound = errors.New("district not found")

// foreignKeyViolation is PostgreSQL's SQLSTATE for a broken reference.
const foreignKeyViolation = "23503"

// ApartmentFilter narrows a listing query. A zero value means "no filter", so
// the public feed and a heavily filtered search run the same code path.
//
// Only fields the UI can actually produce are here. Adding a filter later means
// adding a field and one clause, not restructuring the query.
type ApartmentFilter struct {
	// Status is applied verbatim. The public feed passes "active"; the owner's
	// dashboard passes "" to see drafts and closed listings too.
	Status     string
	OwnerID    *uuid.UUID
	DistrictID *uuid.UUID
	// Keyword matches the title, address or neighbourhood, case-insensitively.
	Keyword  string
	MinPrice *decimal.Decimal
	MaxPrice *decimal.Decimal
	// Rooms is a set: "2 or 3 rooms" is one query, not two.
	Rooms     []int16
	Furnished *bool

	// Sort is one of the values in SortOptions. Anything else falls back to
	// newest-first rather than being interpolated into the SQL.
	Sort string

	Limit  int
	Offset int
}

// Sort orders the API accepts.
const (
	SortNewest    = "newest"
	SortPriceAsc  = "price_asc"
	SortPriceDesc = "price_desc"
)

// orderClauses maps an API sort name to SQL. A map lookup rather than string
// concatenation is what keeps a caller-supplied value out of the query text.
var orderClauses = map[string]string{
	SortNewest:    "apartments.created_at DESC",
	SortPriceAsc:  "apartments.price ASC, apartments.created_at DESC",
	SortPriceDesc: "apartments.price DESC, apartments.created_at DESC",
}

// SortOptions lists the accepted sort values, for validation messages.
var SortOptions = []string{SortNewest, SortPriceAsc, SortPriceDesc}

// ApartmentRepository reads and writes listings. It holds no business rules —
// no ownership checks, no status transitions — only queries.
type ApartmentRepository struct {
	db *gorm.DB
}

func NewApartmentRepository(db *gorm.DB) *ApartmentRepository {
	return &ApartmentRepository{db: db}
}

// withRelations loads everything a listing card or detail page renders, so a
// list of twenty does not turn into sixty follow-up queries.
func (r *ApartmentRepository) withRelations(db *gorm.DB) *gorm.DB {
	return db.
		Preload("District").
		Preload("Owner").
		Preload("Amenities").
		Preload("Images", func(tx *gorm.DB) *gorm.DB {
			// Deterministic gallery order, cover first.
			return tx.Order("apartment_images.is_primary DESC, apartment_images.sort_order ASC, apartment_images.created_at ASC")
		})
}

// Create inserts a listing together with its images and amenity links, in one
// transaction: a listing that half-exists — rows with no pictures, or pictures
// with no listing — is worse than one that failed outright.
func (r *ApartmentRepository) Create(
	ctx context.Context, apartment *models.Apartment, amenityIDs []uuid.UUID,
) error {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Images travel on the struct and are inserted by the association;
		// amenities are attached separately so the join rows carry no extra
		// columns GORM would try to guess.
		if err := tx.Omit("Amenities", "Owner", "District").Create(apartment).Error; err != nil {
			return err
		}
		return replaceAmenities(tx, apartment.ID, amenityIDs)
	})
	if err != nil {
		if isForeignKeyViolation(err) {
			return ErrDistrictNotFound
		}
		return fmt.Errorf("create apartment: %w", err)
	}
	return nil
}

// FindByID loads one listing with everything needed to render it.
func (r *ApartmentRepository) FindByID(ctx context.Context, id uuid.UUID) (*models.Apartment, error) {
	var apartment models.Apartment
	err := r.withRelations(r.db.WithContext(ctx)).First(&apartment, "apartments.id = ?", id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrApartmentNotFound
		}
		return nil, fmt.Errorf("find apartment: %w", err)
	}
	return &apartment, nil
}

// List returns a page of listings and the total number that matched, so the
// client can render "247 ta uy topildi" and a pager without a second request.
//
// The count runs against the same filter but without the ordering, limit or
// preloads — it answers how many exist, not which ones this page shows.
func (r *ApartmentRepository) List(
	ctx context.Context, filter ApartmentFilter,
) ([]models.Apartment, int64, error) {
	var total int64
	countQuery := r.applyFilter(r.db.WithContext(ctx).Model(&models.Apartment{}), filter)
	if err := countQuery.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count apartments: %w", err)
	}
	if total == 0 {
		return []models.Apartment{}, 0, nil
	}

	order, ok := orderClauses[filter.Sort]
	if !ok {
		order = orderClauses[SortNewest]
	}

	query := r.applyFilter(r.withRelations(r.db.WithContext(ctx)), filter).Order(order)
	if filter.Limit > 0 {
		query = query.Limit(filter.Limit)
	}
	if filter.Offset > 0 {
		query = query.Offset(filter.Offset)
	}

	apartments := []models.Apartment{}
	if err := query.Find(&apartments).Error; err != nil {
		return nil, 0, fmt.Errorf("list apartments: %w", err)
	}
	return apartments, total, nil
}

func (r *ApartmentRepository) applyFilter(query *gorm.DB, filter ApartmentFilter) *gorm.DB {
	if filter.Status != "" {
		query = query.Where("apartments.status = ?", filter.Status)
	}
	if filter.OwnerID != nil {
		query = query.Where("apartments.owner_id = ?", *filter.OwnerID)
	}
	if filter.DistrictID != nil {
		query = query.Where("apartments.district_id = ?", *filter.DistrictID)
	}
	if keyword := strings.TrimSpace(filter.Keyword); keyword != "" {
		// ILIKE rather than a full-text index: the corpus is small, and a
		// tsvector would need its own column, trigger and migration to answer
		// the same question no better at this size.
		pattern := "%" + escapeLike(keyword) + "%"
		query = query.Where(
			"(apartments.title ILIKE ? OR apartments.address ILIKE ? OR apartments.neighborhood ILIKE ?)",
			pattern, pattern, pattern,
		)
	}
	if filter.MinPrice != nil {
		query = query.Where("apartments.price >= ?", *filter.MinPrice)
	}
	if filter.MaxPrice != nil {
		query = query.Where("apartments.price <= ?", *filter.MaxPrice)
	}
	if len(filter.Rooms) > 0 {
		query = query.Where("apartments.rooms IN ?", filter.Rooms)
	}
	if filter.Furnished != nil {
		query = query.Where("apartments.furnished = ?", *filter.Furnished)
	}
	return query
}

// Update writes the changed columns and replaces the images and amenities.
//
// `fields` is an explicit column set rather than the whole struct: saving the
// struct would also write owner_id, status and views_count, letting an edit
// silently reassign or republish a listing.
func (r *ApartmentRepository) Update(
	ctx context.Context,
	id uuid.UUID,
	fields map[string]any,
	images []models.ApartmentImage,
	amenityIDs []uuid.UUID,
) error {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if len(fields) > 0 {
			applyPublishedAt(fields)
			result := tx.Model(&models.Apartment{}).Where("id = ?", id).Updates(fields)
			if result.Error != nil {
				return result.Error
			}
		}

		// Replace rather than diff: the client sends the gallery it wants, and
		// working out which of a handful of rows changed costs more than
		// rewriting them.
		if images != nil {
			if err := tx.Where("apartment_id = ?", id).Delete(&models.ApartmentImage{}).Error; err != nil {
				return err
			}
			if len(images) > 0 {
				for i := range images {
					images[i].ApartmentID = id
				}
				if err := tx.Create(&images).Error; err != nil {
					return err
				}
			}
		}

		if amenityIDs != nil {
			return replaceAmenities(tx, id, amenityIDs)
		}
		return nil
	})
	if err != nil {
		if isForeignKeyViolation(err) {
			return ErrDistrictNotFound
		}
		return fmt.Errorf("update apartment: %w", err)
	}
	return nil
}

// Delete removes a listing. Images and amenity links go with it through the
// ON DELETE CASCADE declared in the migration.
func (r *ApartmentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Delete(&models.Apartment{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("delete apartment: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrApartmentNotFound
	}
	return nil
}

// FindOwnerID returns just the owner of a listing.
//
// Authorization asks one question — who owns this? — and loading the whole
// listing with its images and amenities to answer it would be wasteful on every
// update and delete.
func (r *ApartmentRepository) FindOwnerID(ctx context.Context, id uuid.UUID) (uuid.UUID, error) {
	// Scanned into a struct rather than straight into a uuid.UUID: a UUID is a
	// [16]byte, and GORM reads a bare array destination as a row slice, so the
	// driver's string lands one byte at a time and fails to convert.
	var row struct {
		OwnerID uuid.UUID
	}
	result := r.db.WithContext(ctx).
		Model(&models.Apartment{}).
		Select("owner_id").
		Where("id = ?", id).
		Scan(&row)
	if result.Error != nil {
		return uuid.Nil, fmt.Errorf("find apartment owner: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return uuid.Nil, ErrApartmentNotFound
	}
	return row.OwnerID, nil
}

// CountByOwner reports how many listings an owner has in a given status. The
// dashboard's "Faol e'lonlar" figure is this, not a number kept in the UI.
func (r *ApartmentRepository) CountByOwner(
	ctx context.Context, ownerID uuid.UUID, status string,
) (int64, error) {
	query := r.db.WithContext(ctx).Model(&models.Apartment{}).Where("owner_id = ?", ownerID)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return 0, fmt.Errorf("count apartments: %w", err)
	}
	return count, nil
}

// applyPublishedAt keeps published_at in step with status, which the schema
// requires them to be (see ck_apartments_published_at).
//
// It lives here rather than in the service because it is an invariant of the
// row, not a decision: any write that moves the status has to satisfy it. The
// COALESCE is the important part — republishing an already-live listing must
// not reset the date its analytics start from.
func applyPublishedAt(fields map[string]any) {
	status, ok := fields["status"].(string)
	if !ok {
		return
	}
	if status == models.ApartmentStatusActive {
		fields["published_at"] = gorm.Expr("COALESCE(published_at, now())")
		return
	}
	// Unpublished: the listing is not live, so it has no publication date.
	fields["published_at"] = nil
}

// FindDistrictBySlug resolves the slug the frontend uses to the district's id.
func (r *ApartmentRepository) FindDistrictBySlug(
	ctx context.Context, slug string,
) (*models.District, error) {
	var district models.District
	err := r.db.WithContext(ctx).First(&district, "slug = ?", slug).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrDistrictNotFound
		}
		return nil, fmt.Errorf("find district: %w", err)
	}
	return &district, nil
}

// FindAmenityIDsBySlugs maps the slugs the form submits onto amenity ids.
//
// It returns only what it found. The service compares the counts and rejects
// the request if a slug was unknown, rather than silently dropping it.
func (r *ApartmentRepository) FindAmenityIDsBySlugs(
	ctx context.Context, slugs []string,
) ([]uuid.UUID, error) {
	if len(slugs) == 0 {
		return []uuid.UUID{}, nil
	}
	var ids []uuid.UUID
	err := r.db.WithContext(ctx).
		Model(&models.Amenity{}).
		Where("slug IN ?", slugs).
		Pluck("id", &ids).Error
	if err != nil {
		return nil, fmt.Errorf("find amenities: %w", err)
	}
	return ids, nil
}

// ListDistricts returns every district, for the selector and for validation.
func (r *ApartmentRepository) ListDistricts(ctx context.Context) ([]models.District, error) {
	districts := []models.District{}
	if err := r.db.WithContext(ctx).Order("name ASC").Find(&districts).Error; err != nil {
		return nil, fmt.Errorf("list districts: %w", err)
	}
	return districts, nil
}

// replaceAmenities rewrites a listing's amenity links inside the caller's
// transaction.
func replaceAmenities(tx *gorm.DB, apartmentID uuid.UUID, amenityIDs []uuid.UUID) error {
	if err := tx.Where("apartment_id = ?", apartmentID).
		Delete(&models.ApartmentAmenity{}).Error; err != nil {
		return err
	}
	if len(amenityIDs) == 0 {
		return nil
	}

	links := make([]models.ApartmentAmenity, 0, len(amenityIDs))
	for _, amenityID := range amenityIDs {
		links = append(links, models.ApartmentAmenity{ApartmentID: apartmentID, AmenityID: amenityID})
	}
	// A repeated slug in the request must not break the insert.
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&links).Error
}

// isForeignKeyViolation reports a broken reference — in practice a district_id
// that does not exist, which is a bad request rather than a server fault.
func isForeignKeyViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE "+foreignKeyViolation)
}

// escapeLike neutralises the wildcards so a keyword containing % or _ searches
// for those characters instead of matching everything.
func escapeLike(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return replacer.Replace(value)
}
