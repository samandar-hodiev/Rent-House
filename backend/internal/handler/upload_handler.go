package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
	"github.com/samandar-hodiev/Rent-House/backend/internal/service"
	"github.com/samandar-hodiev/Rent-House/backend/internal/storage"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/response"
)

// formField is the multipart field the frontend posts the picture under.
const formField = "image"

// UploadHandler stores listing photographs.
//
// Uploading is its own endpoint rather than part of the listing body: a form
// with several photographs would otherwise have to base64 them into JSON,
// inflating every request by a third and holding the whole gallery in memory on
// both sides. The owner uploads as they pick, and the listing then references
// URLs.
type UploadHandler struct {
	settings *service.SettingsService
	files    storage.Storage
	// baseURL is the public origin uploaded files are reachable at. Empty means
	// "work it out from the request", which is what development wants.
	baseURL string
}

func NewUploadHandler(
	files storage.Storage, settings *service.SettingsService, baseURL string,
) *UploadHandler {
	return &UploadHandler{
		files:    files,
		settings: settings,
		baseURL:  strings.TrimRight(baseURL, "/"),
	}
}

// UploadImage handles POST /api/v1/uploads/images.
//
// Authenticated: storage costs money and disk, so an anonymous caller cannot
// fill it. The upload is not tied to a listing — the listing may not exist yet
// when its first photograph is chosen.
func (h *UploadHandler) UploadImage(c *gin.Context) {
	if _, ok := middleware.UserIDFrom(c); !ok {
		response.Error(c, http.StatusUnauthorized, "missing_token", "Authentication required")
		return
	}

	// What this picture is for. A profile picture and a listing photograph are
	// bounded separately, and the caller says which it is sending — an
	// unrecognised value is treated as a listing photograph, which is the
	// stricter default of the two by configuration rather than by assumption.
	kind := h.kindFor(c.Request.Context(), c.PostForm("purpose"))

	header, err := c.FormFile(formField)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed",
			"Attach an image in the 'image' field")
		return
	}

	// Checked before opening the file, so an oversized upload is refused
	// without reading it. The ceiling is the configured one, and the message
	// carries it rather than a number written into the sentence.
	if header.Size > kind.MaxBytes {
		response.Error(c, http.StatusRequestEntityTooLarge, "file_too_large",
			fmt.Sprintf("The image is larger than %d MB", kind.MaxBytes/(1<<20)))
		return
	}

	file, err := header.Open()
	if err != nil {
		logger.Errorf("upload image: open: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return
	}
	defer file.Close()

	// The browser's declared type is a hint; storage re-checks it against its
	// allow-list and decides the extension itself.
	path, err := h.files.SaveKind(c.Request.Context(), kind, header.Header.Get("Content-Type"), file)
	if err != nil {
		if errors.Is(err, storage.ErrUnsupportedType) {
			response.Error(c, http.StatusUnsupportedMediaType, "unsupported_type",
				"That image format is not accepted")
			return
		}
		var tooLarge storage.ErrTooLarge
		if errors.As(err, &tooLarge) {
			response.Error(c, http.StatusRequestEntityTooLarge, "file_too_large",
				fmt.Sprintf("The image is larger than %d MB", kind.MaxBytes/(1<<20)))
			return
		}
		logger.Errorf("upload image: save: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return
	}

	// An absolute URL, not the stored path. The frontend runs on a different
	// origin in development and may sit behind a different host in production,
	// so a bare "/uploads/..." would resolve against the wrong server and 404.
	// What goes into the database is a URL that works from anywhere.
	response.Success(c, http.StatusCreated, "Image uploaded",
		gin.H{"url": h.absolute(c, path.URL)})
}

// kindFor narrows the image category to the limits configured for this use.
//
// The formats are the marketplace's; only the size differs between a profile
// picture and a listing photograph.
func (h *UploadHandler) kindFor(ctx context.Context, purpose string) storage.Kind {
	const megabyte = 1 << 20
	site := service.Defaults()
	if h.settings != nil {
		site = h.settings.MustGet(ctx)
	}

	megabytes := site.MediaMaxImageMB
	if strings.EqualFold(strings.TrimSpace(purpose), "avatar") {
		megabytes = site.MediaMaxAvatarMB
	}
	return storage.Kinds[storage.KindImage].
		Restrict(int64(megabytes)*megabyte, site.MediaAllowedImageFormats)
}

// absolute turns a stored path into a full URL.
//
// PUBLIC_BASE_URL wins when it is set, which is what a deployment behind a
// proxy or a CDN needs. Otherwise the request's own scheme and host are used,
// so a developer needs no configuration at all.
func (h *UploadHandler) absolute(c *gin.Context, path string) string {
	if h.baseURL != "" {
		return h.baseURL + path
	}

	scheme := "http"
	if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + c.Request.Host + path
}
