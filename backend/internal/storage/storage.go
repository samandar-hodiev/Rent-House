// Package storage keeps uploaded files somewhere and hands back a URL.
//
// It is an interface with one local implementation on purpose. The MVP writes
// to a directory on the same machine, which needs no account, no credentials
// and no network — but every caller talks to the interface, so moving to S3,
// Cloudflare R2 or anything else later means adding a type here and changing
// one line of wiring, not touching the handlers or the database.
//
// What is deliberately NOT done: storing the bytes in PostgreSQL. A row is a
// poor filesystem, and it puts image traffic through the connection pool that
// the rest of the application needs.
package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

// MaxImageBytes caps one upload. Large enough for a phone photo, small enough
// that a handful of requests cannot fill the disk.
const MaxImageBytes = 5 << 20 // 5 MiB

// allowedImageTypes is an allow-list, not a block-list: anything not named here
// is refused. The extension is decided by this map too, so a file called
// "photo.php" cannot keep that name on disk.
var allowedImageTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
}

// ErrUnsupportedType is returned for a content type that is not an accepted
// image.
var ErrUnsupportedType = fmt.Errorf("unsupported image type")

// Storage keeps a file and returns the URL it can be read back from.
type Storage interface {
	// Save reads at most MaxImageBytes from r and stores it, returning a URL
	// relative to the server root.
	Save(ctx context.Context, contentType string, r io.Reader) (string, error)
	// Delete removes a previously stored file. A missing file is not an error:
	// the caller wants it gone, and it is.
	Delete(ctx context.Context, url string) error
}

// LocalStorage writes into a directory and serves it as static files.
type LocalStorage struct {
	// dir is where files land on disk.
	dir string
	// publicPath is the URL prefix the same directory is served under.
	publicPath string
}

// NewLocalStorage prepares the directory, creating it if it does not exist.
func NewLocalStorage(dir, publicPath string) (*LocalStorage, error) {
	if strings.TrimSpace(dir) == "" {
		return nil, fmt.Errorf("storage: a directory is required")
	}
	absolute, err := filepath.Abs(dir)
	if err != nil {
		return nil, fmt.Errorf("storage: resolve %q: %w", dir, err)
	}
	if err := os.MkdirAll(absolute, 0o755); err != nil {
		return nil, fmt.Errorf("storage: create %q: %w", absolute, err)
	}

	return &LocalStorage{
		dir:        absolute,
		publicPath: "/" + strings.Trim(publicPath, "/"),
	}, nil
}

// Dir is where the files live, for wiring up static serving.
func (s *LocalStorage) Dir() string { return s.dir }

// PublicPath is the URL prefix those files are served under.
func (s *LocalStorage) PublicPath() string { return s.publicPath }

// Save writes the upload under a generated name.
//
// The name never comes from the client. A user-supplied filename is a path
// traversal waiting to happen ("../../etc/passwd") and a collision risk; a
// random name plus the extension implied by the accepted content type has
// neither problem.
func (s *LocalStorage) Save(_ context.Context, contentType string, r io.Reader) (string, error) {
	extension, ok := allowedImageTypes[normalizeContentType(contentType)]
	if !ok {
		return "", ErrUnsupportedType
	}

	name, err := randomName(extension)
	if err != nil {
		return "", err
	}

	// Grouped by month so one directory does not accumulate every file the
	// system has ever taken.
	folder := time.Now().UTC().Format("2006-01")
	if err := os.MkdirAll(filepath.Join(s.dir, folder), 0o755); err != nil {
		return "", fmt.Errorf("storage: create folder: %w", err)
	}

	relative := path.Join(folder, name)
	destination := filepath.Join(s.dir, folder, name)

	file, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return "", fmt.Errorf("storage: create file: %w", err)
	}
	defer file.Close()

	// LimitReader is the enforcement, not the declared Content-Length: a client
	// can claim any length it likes.
	written, err := io.Copy(file, io.LimitReader(r, MaxImageBytes+1))
	if err != nil {
		_ = os.Remove(destination)
		return "", fmt.Errorf("storage: write file: %w", err)
	}
	if written > MaxImageBytes {
		_ = os.Remove(destination)
		return "", fmt.Errorf("storage: file exceeds %d bytes", MaxImageBytes)
	}

	return s.publicPath + "/" + relative, nil
}

// Delete removes a stored file, ignoring anything that is not ours.
func (s *LocalStorage) Delete(_ context.Context, url string) error {
	relative, ok := strings.CutPrefix(url, s.publicPath+"/")
	if !ok {
		// Not a URL this storage produced — an external image, or already gone.
		return nil
	}

	// Re-check after cleaning: a crafted URL must not escape the directory even
	// though the prefix matched.
	target := filepath.Join(s.dir, filepath.FromSlash(path.Clean("/"+relative)))
	if !strings.HasPrefix(target, s.dir+string(os.PathSeparator)) {
		return nil
	}

	if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("storage: delete file: %w", err)
	}
	return nil
}

// normalizeContentType drops any parameters, so "image/jpeg; charset=binary"
// still matches.
func normalizeContentType(contentType string) string {
	parsed, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return strings.ToLower(strings.TrimSpace(contentType))
	}
	return parsed
}

// randomName produces an unguessable filename, so stored images cannot be
// enumerated by walking predictable ids.
func randomName(extension string) (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("storage: generate name: %w", err)
	}
	return hex.EncodeToString(buffer) + extension, nil
}
