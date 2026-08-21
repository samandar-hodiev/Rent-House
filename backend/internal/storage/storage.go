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

// ErrUnsupportedType is returned for a content type that is not accepted.
var ErrUnsupportedType = fmt.Errorf("unsupported image type")

// Saved is where a stored file went.
type Saved struct {
	// Path is the location relative to the storage root, which is what the
	// database records and what a protected download reads back.
	Path string
	// URL is where it is served from.
	URL string
	// Bytes actually written.
	Bytes int64
}

// Storage keeps a file and returns where it went.
type Storage interface {
	// Save reads at most MaxImageBytes from r and stores it, returning a URL
	// relative to the server root. Kept for apartment photographs, which
	// predate the typed API below.
	Save(ctx context.Context, contentType string, r io.Reader) (string, error)
	// SaveKind stores a file of a named category, enforcing that category's
	// accepted types and size ceiling.
	SaveKind(ctx context.Context, kind Kind, contentType string, r io.Reader) (Saved, error)
	// Open reads a stored file back, for a download that has to check
	// authorization before serving bytes.
	Open(ctx context.Context, storedPath string) (io.ReadSeekCloser, error)
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

// Save writes an apartment photograph.
//
// Kept because the listing form calls it and predates the typed API. It is now
// a thin wrapper over SaveKind, so the accepted types and the size ceiling are
// defined once and both callers obey the same rules.
func (s *LocalStorage) Save(ctx context.Context, contentType string, r io.Reader) (string, error) {
	saved, err := s.SaveKind(ctx, Kinds[KindImage], contentType, r)
	if err != nil {
		return "", err
	}
	return saved.URL, nil
}

// SaveKind stores one file of a named category.
//
// The name is generated and the extension comes from the accepted content type,
// so nothing about where the file lands is under the client's control. Files are
// grouped by kind and then by month, so one directory never accumulates every
// upload the system has ever taken.
func (s *LocalStorage) SaveKind(
	_ context.Context, kind Kind, contentType string, r io.Reader,
) (Saved, error) {
	extension, ok := kind.Extension(contentType)
	if !ok {
		return Saved{}, ErrUnsupportedType
	}

	name, err := randomName(extension)
	if err != nil {
		return Saved{}, err
	}

	folder := path.Join(kind.Folder, time.Now().UTC().Format("2006-01"))
	if err := os.MkdirAll(filepath.Join(s.dir, filepath.FromSlash(folder)), 0o755); err != nil {
		return Saved{}, fmt.Errorf("storage: create folder: %w", err)
	}

	relative := path.Join(folder, name)
	destination := filepath.Join(s.dir, filepath.FromSlash(relative))

	file, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return Saved{}, fmt.Errorf("storage: create file: %w", err)
	}
	defer file.Close()

	// LimitReader is the enforcement, not the declared Content-Length: a client
	// can claim any length it likes. One byte over the ceiling is read so the
	// difference between "exactly at the limit" and "over it" is detectable.
	written, err := io.Copy(file, io.LimitReader(r, kind.MaxBytes+1))
	if err != nil {
		_ = os.Remove(destination)
		return Saved{}, fmt.Errorf("storage: write file: %w", err)
	}
	if written > kind.MaxBytes {
		_ = os.Remove(destination)
		return Saved{}, ErrTooLarge{Kind: kind.Name, MaxBytes: kind.MaxBytes}
	}
	if written == 0 {
		_ = os.Remove(destination)
		return Saved{}, fmt.Errorf("storage: file is empty")
	}

	return Saved{
		Path:  relative,
		URL:   s.publicPath + "/" + relative,
		Bytes: written,
	}, nil
}

// Open reads a stored file back.
//
// The path is re-cleaned and re-checked against the root even though it came
// from our own database: a bug elsewhere that let a crafted path be stored must
// not become a way to read arbitrary files off the disk.
func (s *LocalStorage) Open(_ context.Context, storedPath string) (io.ReadSeekCloser, error) {
	target := filepath.Join(s.dir, filepath.FromSlash(path.Clean("/"+storedPath)))
	if !strings.HasPrefix(target, s.dir+string(os.PathSeparator)) {
		return nil, fmt.Errorf("storage: path escapes the storage root")
	}

	file, err := os.Open(target)
	if err != nil {
		return nil, fmt.Errorf("storage: open file: %w", err)
	}
	return file, nil
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
