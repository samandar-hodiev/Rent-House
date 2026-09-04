//go:build integration

// Notifications: what generates one, who receives it, and what switching it off
// actually does.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run Notification
package handler

import (
	"testing"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
)

func TestNotificationFanOutAndRead(t *testing.T) {
	h := newAdminHarness(t)
	ctx := t.Context()

	notifications := repository.NewNotificationRepository(h.tx)
	feed := service.NewNotificationService(notifications, h.settings)

	// Everything on, so a notification is expected.
	configureSettings(t, h, map[string]any{models.SettingNotifyNewReport: true})

	before, err := notifications.CountUnread(ctx, models.AudienceAdmin, h.owner.ID)
	if err != nil {
		t.Fatalf("count: %v", err)
	}

	feed.NotifyAdmins(ctx, models.NotificationReportCreated,
		models.NotificationEntityReport, uuid.New(),
		models.JSONMap{"title": "Test listing", "reason": models.ReportReasonFraud})

	after, err := notifications.CountUnread(ctx, models.AudienceAdmin, h.owner.ID)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if after != before+1 {
		t.Fatalf("unread: got %d, want %d", after, before+1)
	}

	// The payload survives the round trip, which is what the sentence is
	// rendered from.
	page, err := feed.List(ctx, models.AudienceAdmin, h.owner.ID, true, 1, 10)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(page.Notifications) == 0 {
		t.Fatal("the feed is empty")
	}
	newest := page.Notifications[0]
	if newest.Payload["title"] != "Test listing" {
		t.Errorf("payload: got %v", newest.Payload)
	}

	// Reading one lowers the badge by one.
	if err := feed.MarkRead(ctx, newest.ID, models.AudienceAdmin, h.owner.ID); err != nil {
		t.Fatalf("mark read: %v", err)
	}
	read, _ := notifications.CountUnread(ctx, models.AudienceAdmin, h.owner.ID)
	if read != after-1 {
		t.Fatalf("after reading one: got %d, want %d", read, after-1)
	}

	// And reading everything clears it.
	if _, err := feed.MarkAllRead(ctx, models.AudienceAdmin, h.owner.ID); err != nil {
		t.Fatalf("mark all read: %v", err)
	}
	cleared, _ := notifications.CountUnread(ctx, models.AudienceAdmin, h.owner.ID)
	if cleared != 0 {
		t.Fatalf("after reading all: got %d, want 0", cleared)
	}
}

// Switching a notification off must leave no row at all — a hidden row would
// still count towards an unread badge the moment it was switched back on.
func TestNotificationSettingSilencesAtTheSource(t *testing.T) {
	h := newAdminHarness(t)
	ctx := t.Context()

	notifications := repository.NewNotificationRepository(h.tx)
	feed := service.NewNotificationService(notifications, h.settings)

	configureSettings(t, h, map[string]any{models.SettingNotifyNewRegistration: false})
	before, _ := notifications.CountUnread(ctx, models.AudienceAdmin, h.owner.ID)

	feed.NotifyAdmins(ctx, models.NotificationUserRegistered,
		models.NotificationEntityUser, uuid.New(), models.JSONMap{"name": "Nobody"})

	after, _ := notifications.CountUnread(ctx, models.AudienceAdmin, h.owner.ID)
	if after != before {
		t.Fatalf("a switched-off notification was written: %d -> %d", before, after)
	}

	// Back on, and the same call writes one.
	configureSettings(t, h, map[string]any{models.SettingNotifyNewRegistration: true})
	feed.NotifyAdmins(ctx, models.NotificationUserRegistered,
		models.NotificationEntityUser, uuid.New(), models.JSONMap{"name": "Somebody"})
	on, _ := notifications.CountUnread(ctx, models.AudienceAdmin, h.owner.ID)
	if on != before+1 {
		t.Fatalf("switched back on: got %d, want %d", on, before+1)
	}
}

// One person's feed is theirs alone.
func TestNotificationFeedsAreSeparate(t *testing.T) {
	h := newAdminHarness(t)
	ctx := t.Context()

	notifications := repository.NewNotificationRepository(h.tx)
	feed := service.NewNotificationService(notifications, h.settings)

	var user models.User
	if err := h.tx.First(&user).Error; err != nil {
		t.Skipf("no account: %v", err)
	}
	configureSettings(t, h, map[string]any{models.SettingNotifyModeration: true})

	feed.NotifyUser(ctx, user.ID, models.NotificationListingModerated,
		models.NotificationEntityListing, uuid.New(),
		models.JSONMap{"title": "Theirs", "status": models.ApartmentStatusActive})

	// It is in the user's feed.
	mine, err := feed.List(ctx, models.AudienceUser, user.ID, false, 1, 10)
	if err != nil {
		t.Fatalf("user feed: %v", err)
	}
	if len(mine.Notifications) == 0 {
		t.Fatal("the user was not told")
	}

	// Reading it as somebody else does nothing: the recipient is part of the
	// write, not checked beforehand.
	stranger := uuid.New()
	if err := feed.MarkRead(ctx, mine.Notifications[0].ID, models.AudienceUser, stranger); err != nil {
		t.Fatalf("mark read: %v", err)
	}
	still, _ := notifications.CountUnread(ctx, models.AudienceUser, user.ID)
	if still == 0 {
		t.Fatal("a stranger marked somebody else's notification read")
	}
}
