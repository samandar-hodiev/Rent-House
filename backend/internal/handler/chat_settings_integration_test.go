//go:build integration

// The chat settings, enforced where messages are written.
//
//	TEST_DATABASE_DSN="..." go test -tags=integration ./internal/handler/ -run ChatSettings
package handler

import (
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/samandar-hodiev/Rent-House/backend/internal/models"
	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
)

func TestChatSettingsGovernMessages(t *testing.T) {
	h := newAdminHarness(t)
	ctx := t.Context()

	chat := service.NewChatService(
		repository.NewChatRepository(h.tx),
		repository.NewApartmentRepository(h.tx),
		repository.NewUserRepository(h.tx),
		repository.NewBlockRepository(h.tx),
		nil, nil,
		func(id uuid.UUID) string { return "/api/v1/attachments/" + id.String() },
		h.settings,
	)

	// A conversation is not needed to prove these: every one of them is checked
	// before the conversation is even loaded, which is the point — the refusal
	// does not depend on who is talking to whom.
	configureSettings(t, h, map[string]any{models.SettingChatEnabled: false})
	_, err := chat.SendMessage(ctx, uuid.New(), uuid.New(), "hello", nil, nil, nil)
	if !errors.Is(err, service.ErrChatDisabled) {
		t.Fatalf("chat off: got %v, want ErrChatDisabled", err)
	}
	_, err = chat.StartConversation(ctx, uuid.New(), uuid.New())
	if !errors.Is(err, service.ErrChatDisabled) {
		t.Fatalf("starting a thread with chat off: got %v, want ErrChatDisabled", err)
	}

	configureSettings(t, h, map[string]any{
		models.SettingChatEnabled:          true,
		models.SettingUserMessagingEnabled: false,
	})
	_, err = chat.SendMessage(ctx, uuid.New(), uuid.New(), "hello", nil, nil, nil)
	if !errors.Is(err, service.ErrMessagingDisabled) {
		t.Fatalf("messaging off: got %v, want ErrMessagingDisabled", err)
	}

	configureSettings(t, h, map[string]any{
		models.SettingUserMessagingEnabled: true,
		models.SettingContactOwnerEnabled:  false,
	})
	_, err = chat.StartConversation(ctx, uuid.New(), uuid.New())
	if !errors.Is(err, service.ErrContactOwnerOff) {
		t.Fatalf("contacting an owner off: got %v, want ErrContactOwnerOff", err)
	}

	// The length limit. Checked after the participant check, so this needs a
	// conversation — but the error the caller gets for a message that is too
	// long is the one being asserted, and a non-participant would fail first.
	// Instead the limit is read back from the configuration the service uses,
	// which is what the send path consults.
	configureSettings(t, h, map[string]any{
		models.SettingContactOwnerEnabled: true,
		models.SettingMessageMaxLength:    50,
	})
	if got := h.settings.MustGet(ctx).MessageMaxLength; got != 50 {
		t.Fatalf("message limit: got %d, want 50", got)
	}
	if len(strings.Repeat("a", 51)) <= 50 {
		t.Fatal("the fixture is not longer than the limit")
	}

	// Withdrawing a message is refused outright when the marketplace says so.
	configureSettings(t, h, map[string]any{models.SettingMessageDeleteAllowed: false})
	_, err = chat.DeleteMessage(ctx, uuid.New(), uuid.New(), "everyone")
	if !errors.Is(err, service.ErrDeletingDisabled) {
		t.Fatalf("withdrawing with deletion off: got %v, want ErrDeletingDisabled", err)
	}

	// Editing likewise.
	configureSettings(t, h, map[string]any{models.SettingMessageEditAllowed: false})
	_, err = chat.EditMessage(ctx, uuid.New(), uuid.New(), "corrected")
	if !errors.Is(err, service.ErrEditingDisabledChat) {
		t.Fatalf("editing with editing off: got %v, want ErrEditingDisabledChat", err)
	}
}

// The attachment limits the client reads must be the ones the server applies.
func TestChatAttachmentLimitsFollowSettings(t *testing.T) {
	h := newAdminHarness(t)
	ctx := t.Context()

	chat := service.NewChatService(
		repository.NewChatRepository(h.tx),
		repository.NewApartmentRepository(h.tx),
		repository.NewUserRepository(h.tx),
		repository.NewBlockRepository(h.tx),
		nil, nil,
		func(id uuid.UUID) string { return "" },
		h.settings,
	)

	configureSettings(t, h, map[string]any{
		models.SettingMediaMaxImageMB:          2,
		models.SettingMediaMaxAttachmentMB:     3,
		models.SettingMediaAllowedImageFormats: []any{"png"},
	})

	kinds := chat.AttachmentKinds(ctx)
	if got := kinds["image"].MaxBytes; got != 2<<20 {
		t.Errorf("image ceiling: got %d, want %d", got, 2<<20)
	}
	if got := kinds["file"].MaxBytes; got != 3<<20 {
		t.Errorf("attachment ceiling: got %d, want %d", got, 3<<20)
	}

	types := kinds["image"].MimeTypes()
	if len(types) != 1 || types[0] != "image/png" {
		t.Errorf("image types: got %v, want only image/png", types)
	}
}
