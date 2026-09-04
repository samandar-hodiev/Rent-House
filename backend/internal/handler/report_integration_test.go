//go:build integration

// Complaints about listings: raising one, the rules about who may, and the
// threshold that withdraws a listing when enough people agree.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run Report
//
// Inside a rolled-back transaction, so it can be pointed at a populated
// database without leaving complaints behind.
package handler

import (
	"testing"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
)

// reportFixture is a published listing, its owner, and somebody else to
// complain about it.
type reportFixture struct {
	harness   *adminHarness
	reports   *service.ReportService
	apartment uuid.UUID
	owner     uuid.UUID
	stranger  uuid.UUID
}

func newReportFixture(t *testing.T) *reportFixture {
	t.Helper()
	h := newAdminHarness(t)

	apartments := repository.NewApartmentRepository(h.tx)
	reports := service.NewReportService(
		repository.NewReportRepository(h.tx), apartments, h.settings)

	var listing models.Apartment
	if err := h.tx.Where("status = ?", models.ApartmentStatusActive).
		First(&listing).Error; err != nil {
		t.Skipf("no published listing to report: %v", err)
	}

	// Somebody who is not the owner.
	var stranger models.User
	if err := h.tx.Where("id <> ?", listing.OwnerID).First(&stranger).Error; err != nil {
		t.Skipf("no second account to report with: %v", err)
	}

	return &reportFixture{
		harness: h, reports: reports,
		apartment: listing.ID, owner: listing.OwnerID, stranger: stranger.ID,
	}
}

func TestReportRules(t *testing.T) {
	f := newReportFixture(t)
	ctx := t.Context()

	t.Run("an owner cannot report their own listing", func(t *testing.T) {
		_, err := f.reports.Create(ctx, f.apartment, f.owner, models.ReportReasonFraud, "")
		if err != service.ErrCannotReportOwnListing {
			t.Fatalf("got %v, want ErrCannotReportOwnListing", err)
		}
	})

	t.Run("a reason outside the set is refused", func(t *testing.T) {
		_, err := f.reports.Create(ctx, f.apartment, f.stranger, "because", "")
		if err != service.ErrInvalidReportReason {
			t.Fatalf("got %v, want ErrInvalidReportReason", err)
		}
	})

	t.Run("a listing nobody published cannot be reported", func(t *testing.T) {
		_, err := f.reports.Create(ctx, uuid.New(), f.stranger, models.ReportReasonFraud, "")
		if err != service.ErrApartmentNotFound {
			t.Fatalf("got %v, want ErrApartmentNotFound", err)
		}
	})

	t.Run("one complaint per person per listing", func(t *testing.T) {
		if _, err := f.reports.Create(
			ctx, f.apartment, f.stranger, models.ReportReasonWrongInfo, "narxi noto'g'ri",
		); err != nil {
			t.Fatalf("first report: %v", err)
		}
		_, err := f.reports.Create(ctx, f.apartment, f.stranger, models.ReportReasonFraud, "")
		if err != service.ErrAlreadyReported {
			t.Fatalf("second report: got %v, want ErrAlreadyReported", err)
		}
	})
}

func TestReportThresholdWithdrawsAListing(t *testing.T) {
	f := newReportFixture(t)
	ctx := t.Context()

	// Two complaints are enough here, so the test needs two accounts.
	var others []models.User
	if err := f.harness.tx.Where("id <> ?", f.owner).Limit(2).Find(&others).Error; err != nil ||
		len(others) < 2 {
		t.Skip("needs two accounts besides the owner")
	}
	configureSettings(t, f.harness, map[string]any{models.SettingReportThreshold: 2})

	status := func() string {
		var listing models.Apartment
		if err := f.harness.tx.Where("id = ?", f.apartment).First(&listing).Error; err != nil {
			t.Fatalf("read listing: %v", err)
		}
		return listing.Status
	}

	if _, err := f.reports.Create(
		ctx, f.apartment, others[0].ID, models.ReportReasonFraud, "",
	); err != nil {
		t.Fatalf("first report: %v", err)
	}
	if got := status(); got != models.ApartmentStatusActive {
		t.Fatalf("one report below the threshold changed the listing: %s", got)
	}

	if _, err := f.reports.Create(
		ctx, f.apartment, others[1].ID, models.ReportReasonOffensive, "",
	); err != nil {
		t.Fatalf("second report: %v", err)
	}
	if got := status(); got != models.ApartmentStatusPending {
		t.Fatalf("at the threshold the listing was not withdrawn: %s", got)
	}
}

func TestReportThresholdOffByDefault(t *testing.T) {
	f := newReportFixture(t)
	// Zero is the default and means "record them, withdraw nothing".
	configureSettings(t, f.harness, map[string]any{models.SettingReportThreshold: 0})

	if _, err := f.reports.Create(
		t.Context(), f.apartment, f.stranger, models.ReportReasonFraud, "",
	); err != nil {
		t.Fatalf("report: %v", err)
	}

	var listing models.Apartment
	if err := f.harness.tx.Where("id = ?", f.apartment).First(&listing).Error; err != nil {
		t.Fatalf("read listing: %v", err)
	}
	if listing.Status != models.ApartmentStatusActive {
		t.Fatalf("the threshold was off and the listing still moved: %s", listing.Status)
	}
}

func TestReportListAndDecision(t *testing.T) {
	f := newReportFixture(t)
	ctx := t.Context()

	report, err := f.reports.Create(
		ctx, f.apartment, f.stranger, models.ReportReasonDuplicate, "takroriy e'lon")
	if err != nil {
		t.Fatalf("report: %v", err)
	}

	page, err := f.reports.List(ctx, models.ReportStatusOpen, "", 1, 20)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	var found bool
	for _, row := range page.Reports {
		if row.ID == report.ID {
			found = true
			if row.ApartmentTitle == "" {
				t.Error("the row carries no listing title")
			}
			if row.OpenCount < 1 {
				t.Error("the row counts no open complaints")
			}
		}
	}
	if !found {
		t.Fatal("the new complaint is not in the open list")
	}

	// A decision records who made it.
	decided, err := f.reports.SetStatus(
		ctx, report.ID, models.ReportStatusResolved, "e'lon yopildi", f.harness.owner.ID)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if decided.Status != models.ReportStatusResolved {
		t.Fatalf("status: got %s, want resolved", decided.Status)
	}
	if decided.ResolvedAt == nil || decided.ResolvedBy == nil {
		t.Fatal("a resolved complaint has no author or date")
	}

	// And it is out of the open list, which is what the threshold counts.
	open, err := repository.NewReportRepository(f.harness.tx).
		CountOpenForApartment(ctx, f.apartment)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if open != 0 {
		t.Fatalf("open complaints after resolving: %d, want 0", open)
	}
}
