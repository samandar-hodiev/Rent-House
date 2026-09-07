//go:build integration

// A photo dropped from an edited gallery used to stay on disk forever — the
// database row was replaced, but nothing ever told storage the old file was
// no longer wanted. This is the fix: ApartmentService.Update now reads the
// gallery it is about to overwrite and deletes whatever is not in the new one.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/service/ -run ImageCleanup
package service_test

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/internal/storage"
)

// uploadTestImage writes a real file through the real storage code path — the
// same one the upload endpoint uses — and hands back the URL an owner's
// browser would have gotten back and put in a listing's gallery.
func uploadTestImage(t *testing.T, files *storage.LocalStorage) string {
	t.Helper()
	body := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, make([]byte, 32)...) // real JPEG magic bytes
	saved, err := files.SaveKind(t.Context(), storage.Kinds[storage.KindImage], "image/jpeg",
		bytes.NewReader(body))
	if err != nil {
		t.Fatalf("upload test image: %v", err)
	}
	return files.PublicPath() + "/" + saved.Path
}

func TestUpdateDeletesAPhotoDroppedFromTheGalleryButKeepsTheRest(t *testing.T) {
	tx := settingsTx(t)
	ctx := context.Background()

	files, err := storage.NewLocalStorage(t.TempDir(), "/uploads")
	if err != nil {
		t.Fatalf("storage: %v", err)
	}

	settings := service.NewSettingsService(repository.NewSettingsRepository(tx))
	apartments := service.NewApartmentService(
		repository.NewApartmentRepository(tx), settings,
		service.NewNotificationService(repository.NewNotificationRepository(tx), settings),
		files,
	)

	var ownerRaw string
	if err := tx.Raw(`SELECT id::text FROM users LIMIT 1`).Scan(&ownerRaw).Error; err != nil {
		t.Fatalf("owner account: %v", err)
	}
	if ownerRaw == "" {
		t.Skip("no account to write listings as")
	}
	ownerID, err := uuid.Parse(ownerRaw)
	if err != nil {
		t.Fatalf("owner id: %v", err)
	}
	var districtSlug string
	if err := tx.Raw(`SELECT slug FROM districts LIMIT 1`).Scan(&districtSlug).Error; err != nil {
		t.Fatalf("district: %v", err)
	}

	kept := uploadTestImage(t, files)
	dropped := uploadTestImage(t, files)

	base := func(images []dto.ApartmentImageInput) dto.ApartmentWriteRequest {
		return dto.ApartmentWriteRequest{
			Title: "Image cleanup test listing", Description: "Exercises the storage cleanup on edit.",
			Price: "4500000", Currency: "UZS", RentalPeriod: "monthly",
			Rooms: 2, Area: 55, Floor: 3, TotalFloors: 9, ApartmentType: "apartment",
			DistrictSlug: districtSlug, Address: "Test address 1",
			Latitude: 41.311081, Longitude: 69.240562,
			Images: images, Publish: false,
		}
	}

	created, err := apartments.Create(ctx, ownerID, base([]dto.ApartmentImageInput{
		{URL: kept, IsPrimary: true},
		{URL: dropped, IsPrimary: false},
	}))
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Both files exist right after upload and creation.
	assertFileExists(t, files, kept, true)
	assertFileExists(t, files, dropped, true)

	// The edit's gallery keeps one photo and drops the other.
	if _, err := apartments.Update(ctx, created.ID, ownerID, base([]dto.ApartmentImageInput{
		{URL: kept, IsPrimary: true},
	})); err != nil {
		t.Fatalf("update: %v", err)
	}

	assertFileExists(t, files, kept, true)
	assertFileExists(t, files, dropped, false)
}

func assertFileExists(t *testing.T, files *storage.LocalStorage, url string, want bool) {
	t.Helper()
	relative := url[len(files.PublicPath())+1:]
	_, err := os.Stat(filepath.Join(files.Dir(), filepath.FromSlash(relative)))
	exists := err == nil
	if exists != want {
		t.Fatalf("file for %q: exists=%v, want %v (stat err: %v)", url, exists, want, err)
	}
}
