package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/samandar-hodiev/Rent-House/backend/internal/middleware"
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
	files storage.Storage
}

func NewUploadHandler(files storage.Storage) *UploadHandler {
	return &UploadHandler{files: files}
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

	header, err := c.FormFile(formField)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "validation_failed",
			"Attach an image in the 'image' field")
		return
	}

	// Checked before opening the file, so an oversized upload is refused
	// without reading it.
	if header.Size > storage.MaxImageBytes {
		response.Error(c, http.StatusRequestEntityTooLarge, "file_too_large",
			"The image is larger than 5 MB")
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
	url, err := h.files.Save(c.Request.Context(), header.Header.Get("Content-Type"), file)
	if err != nil {
		if errors.Is(err, storage.ErrUnsupportedType) {
			response.Error(c, http.StatusUnsupportedMediaType, "unsupported_type",
				"Only JPEG, PNG and WebP images are accepted")
			return
		}
		logger.Errorf("upload image: save: %v", err)
		response.Error(c, http.StatusInternalServerError, "internal_error", "Something went wrong")
		return
	}

	response.Success(c, http.StatusCreated, "Image uploaded", gin.H{"url": url})
}
