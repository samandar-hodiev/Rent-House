//go:build integration

// A reporter's own history: what they reported, and what came of it — the
// only view of a complaint's outcome that exists for anybody but an
// administrator.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run MyReports
package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/dto"
	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
)

type myReportsPage struct {
	Reports []dto.MyReportResponse `json:"reports"`
	Total   int64                  `json:"total"`
}

func (h *harness) fileReport(t *testing.T, listingID uuid.UUID, bearer string) dto.ReportResponse {
	t.Helper()
	rec := h.do(t, http.MethodPost, fmt.Sprintf("/api/v1/apartments/%s/reports", listingID),
		map[string]any{"reason": models.ReportReasonFraud, "comment": "test complaint"}, bearer)
	if rec.Code != http.StatusCreated {
		t.Fatalf("file report: got %d, want 201 (%s)", rec.Code, rec.Body.String())
	}
	var report dto.ReportResponse
	if err := json.Unmarshal(decode(t, rec).Data, &report); err != nil {
		t.Fatalf("decode report: %v", err)
	}
	return report
}

func (h *harness) myReports(t *testing.T, bearer string) myReportsPage {
	t.Helper()
	rec := h.do(t, http.MethodGet, "/api/v1/me/reports", nil, bearer)
	if rec.Code != http.StatusOK {
		t.Fatalf("my reports: got %d, want 200 (%s)", rec.Code, rec.Body.String())
	}
	var page myReportsPage
	if err := json.Unmarshal(decode(t, rec).Data, &page); err != nil {
		t.Fatalf("decode page: %v", err)
	}
	return page
}

func TestMyReportsListsWhatIRaised(t *testing.T) {
	h := newHarness(t)

	ownerAuth := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())
	ownerID, err := uuid.Parse(ownerAuth.User.ID)
	if err != nil {
		t.Fatalf("parse owner id: %v", err)
	}
	reporterAuth := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())

	listingID := h.ownedListing(t, ownerID, models.ApartmentStatusActive)
	created := h.fileReport(t, listingID, "Bearer "+reporterAuth.AccessToken)

	page := h.myReports(t, "Bearer "+reporterAuth.AccessToken)
	if page.Total != 1 || len(page.Reports) != 1 {
		t.Fatalf("got %d report(s), want exactly 1", page.Total)
	}

	got := page.Reports[0]
	if got.ID != created.ID {
		t.Errorf("id = %q, want %q", got.ID, created.ID)
	}
	if got.ApartmentID != listingID.String() {
		t.Errorf("apartment_id = %q, want %q", got.ApartmentID, listingID.String())
	}
	if got.ApartmentTitle == "" {
		t.Error("apartment_title is empty — the listing cannot be identified")
	}
	if got.ApartmentStatus != models.ApartmentStatusActive {
		t.Errorf("apartment_status = %q, want %q", got.ApartmentStatus, models.ApartmentStatusActive)
	}
	if got.Reason != models.ReportReasonFraud {
		t.Errorf("reason = %q, want %q", got.Reason, models.ReportReasonFraud)
	}
	if got.Status != models.ReportStatusOpen {
		t.Errorf("status = %q, want %q", got.Status, models.ReportStatusOpen)
	}
}

// The decision reaches the reporter once an administrator has made one — the
// same field the dashboard writes, read back rather than duplicated.
func TestMyReportsShowsTheResolution(t *testing.T) {
	h := newHarness(t)

	ownerAuth := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())
	ownerID, err := uuid.Parse(ownerAuth.User.ID)
	if err != nil {
		t.Fatalf("parse owner id: %v", err)
	}
	reporterAuth := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())
	admin := anyAdminForReports(t, h)

	listingID := h.ownedListing(t, ownerID, models.ApartmentStatusActive)
	created := h.fileReport(t, listingID, "Bearer "+reporterAuth.AccessToken)

	reportID, err := uuid.Parse(created.ID)
	if err != nil {
		t.Fatalf("parse report id: %v", err)
	}
	if _, err := h.reports.SetStatus(
		t.Context(), reportID, models.ReportStatusDismissed, "checked, listing is fine", admin,
	); err != nil {
		t.Fatalf("resolve report: %v", err)
	}

	page := h.myReports(t, "Bearer "+reporterAuth.AccessToken)
	if len(page.Reports) != 1 {
		t.Fatalf("got %d report(s), want 1", len(page.Reports))
	}
	got := page.Reports[0]
	if got.Status != models.ReportStatusDismissed {
		t.Errorf("status = %q, want %q", got.Status, models.ReportStatusDismissed)
	}
	if got.Resolution != "checked, listing is fine" {
		t.Errorf("resolution = %q, want the admin's note", got.Resolution)
	}
	if got.ResolvedAt == nil {
		t.Error("resolved_at was not set")
	}
}

// One account's history must not include another's — the same isolation the
// admin's own table gets from being admin-only, applied the other way round.
func TestMyReportsDoesNotLeakOtherAccounts(t *testing.T) {
	h := newHarness(t)

	ownerAuth := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())
	ownerID, err := uuid.Parse(ownerAuth.User.ID)
	if err != nil {
		t.Fatalf("parse owner id: %v", err)
	}
	firstReporter := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())
	secondReporter := h.registerFully(t, models.VerificationMethodEmail, uniqueEmail())

	listingID := h.ownedListing(t, ownerID, models.ApartmentStatusActive)
	h.fileReport(t, listingID, "Bearer "+firstReporter.AccessToken)

	page := h.myReports(t, "Bearer "+secondReporter.AccessToken)
	if page.Total != 0 || len(page.Reports) != 0 {
		t.Fatalf("got %d report(s) for an account that reported nothing, want 0", page.Total)
	}
}

func TestMyReportsRequiresAuthentication(t *testing.T) {
	h := newHarness(t)
	rec := h.do(t, http.MethodGet, "/api/v1/me/reports", nil, "")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

// anyAdminForReports borrows an administrator id to record as the decision's
// author, creating one if the database has none — self-sufficient the same
// way the repository package's own fixtures are, so this runs the same on an
// empty CI database as on a populated development one.
func anyAdminForReports(t *testing.T, h *harness) uuid.UUID {
	t.Helper()
	var admin models.Admin
	if err := h.db.First(&admin).Error; err == nil {
		return admin.ID
	}
	created := models.Admin{
		Name: "Report Fixture Admin", Email: uniqueEmail(),
		PasswordHash: "not-a-real-hash",
		Role:         models.AdminRoleSuperAdmin, Status: models.AdminStatusActive,
	}
	if err := h.db.Create(&created).Error; err != nil {
		t.Fatalf("create fixture admin: %v", err)
	}
	t.Cleanup(func() {
		h.db.Unscoped().Delete(&created)
	})
	return created.ID
}
