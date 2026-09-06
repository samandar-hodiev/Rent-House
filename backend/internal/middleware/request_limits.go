package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// MaxRequestBodyBytes bounds every request this server accepts, uploads
// included. Set above the largest single kind storage.go actually allows (see
// storage.MaxFileBytes, 20 MiB for a chat attachment) rather than tied to it —
// this is not the per-kind limit that produces a clean "file too large"
// message; it exists only so a body nobody was ever going to accept legally
// cannot make the server read an unbounded amount of it first. Uploads are
// one file per request (confirmed: UploadHandler reads a single FormFile), so
// nothing legitimate needs more headroom than this.
const MaxRequestBodyBytes = 25 << 20 // 25 MiB

// LimitRequestBody caps how much of a request's body this server will read,
// regardless of what the handler behind it does with the rest. Without it,
// nothing between the TCP socket and an individual handler's own logic stops
// a request body of any size from being read into memory or written to disk —
// every plain JSON endpoint, not only the upload ones, is exposed to this
// until a handler happens to impose its own limit.
func LimitRequestBody(max int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, max)
		c.Next()
	}
}
