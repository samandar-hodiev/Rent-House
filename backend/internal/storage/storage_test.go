package storage_test

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/samandar-hodiev/Rent-House/backend/internal/storage"
)

func newStorage(t *testing.T) *storage.LocalStorage {
	t.Helper()
	s, err := storage.NewLocalStorage(t.TempDir(), "/uploads")
	if err != nil {
		t.Fatalf("new local storage: %v", err)
	}
	return s
}

// Real magic bytes for each accepted image format, padded past the 512-byte
// sniff window so a short-file edge case elsewhere cannot mask a bug here.
func jpegBytes() []byte { return append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, make([]byte, 600)...) }
func pngBytes() []byte {
	return append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 600)...)
}
func gifBytes() []byte { return append([]byte("GIF89a"), make([]byte, 600)...) }
func webpBytes() []byte {
	return append([]byte("RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00"), make([]byte, 600)...)
}

func TestSaveKindAcceptsEachRealImageFormat(t *testing.T) {
	s := newStorage(t)
	cases := []struct {
		name        string
		contentType string
		body        []byte
		ext         string
	}{
		{"jpeg", "image/jpeg", jpegBytes(), ".jpg"},
		{"png", "image/png", pngBytes(), ".png"},
		{"gif", "image/gif", gifBytes(), ".gif"},
		{"webp", "image/webp", webpBytes(), ".webp"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			saved, err := s.SaveKind(context.Background(), storage.Kinds[storage.KindImage],
				tc.contentType, bytes.NewReader(tc.body))
			if err != nil {
				t.Fatalf("SaveKind: %v", err)
			}
			if !strings.HasSuffix(saved.Path, tc.ext) {
				t.Fatalf("path %q does not end in %q", saved.Path, tc.ext)
			}
			if saved.Bytes != int64(len(tc.body)) {
				t.Fatalf("wrote %d bytes, want %d", saved.Bytes, len(tc.body))
			}

			// The bytes on disk must be exactly what was sent — SaveKind reads
			// a sniffing prefix off the stream and has to put it back rather
			// than drop it or double it.
			on, err := os.ReadFile(filepath.Join(s.Dir(), filepath.FromSlash(saved.Path)))
			if err != nil {
				t.Fatalf("read saved file: %v", err)
			}
			if !bytes.Equal(on, tc.body) {
				t.Fatalf("saved content does not match what was uploaded (got %d bytes, want %d)",
					len(on), len(tc.body))
			}
		})
	}
}

// The header is a claim, not a fact: this is what the audit flagged — a file
// that is not actually a photograph, given an image Content-Type and an image
// extension, must not be accepted just because the client said so.
func TestSaveKindRejectsAFileWhoseBytesDisagreeWithTheDeclaredType(t *testing.T) {
	s := newStorage(t)
	html := []byte("<html><body><script>alert(document.cookie)</script></body></html>")

	_, err := s.SaveKind(context.Background(), storage.Kinds[storage.KindImage],
		"image/jpeg", bytes.NewReader(html))
	if !errors.Is(err, storage.ErrUnsupportedType) {
		t.Fatalf("got %v, want ErrUnsupportedType", err)
	}

	entries, err := os.ReadDir(s.Dir())
	if err != nil {
		t.Fatalf("read storage dir: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("a rejected upload left something behind: %v", entries)
	}
}

// A file smaller than the sniffing window is not a partial read failure — most
// real photographs are well over 512 bytes, but nothing requires one to be.
func TestSaveKindAcceptsAFileShorterThanTheSniffWindow(t *testing.T) {
	s := newStorage(t)
	body := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0}

	saved, err := s.SaveKind(context.Background(), storage.Kinds[storage.KindImage],
		"image/jpeg", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("SaveKind: %v", err)
	}
	on, err := os.ReadFile(filepath.Join(s.Dir(), filepath.FromSlash(saved.Path)))
	if err != nil {
		t.Fatalf("read saved file: %v", err)
	}
	if !bytes.Equal(on, body) {
		t.Fatalf("saved content does not match what was uploaded")
	}
}

// Go's sniffer has no signature for the legacy OLE-based .doc format — it
// reads back as application/octet-stream — so the byte check must not reject
// it just because it cannot positively confirm it either.
func TestSaveKindStillAcceptsFormatsTheSnifferCannotIdentify(t *testing.T) {
	s := newStorage(t)
	oleHeader := []byte{0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1}

	saved, err := s.SaveKind(context.Background(), storage.Kinds[storage.KindFile],
		"application/msword", bytes.NewReader(oleHeader))
	if err != nil {
		t.Fatalf("SaveKind: %v", err)
	}
	if !strings.HasSuffix(saved.Path, ".doc") {
		t.Fatalf("path %q does not end in .doc", saved.Path)
	}
}

// An unmapped Content-Type is refused before anything is read off the body —
// unrelated to the byte-sniffing above, and worth pinning down alongside it.
func TestSaveKindRejectsAnUnknownContentType(t *testing.T) {
	s := newStorage(t)
	_, err := s.SaveKind(context.Background(), storage.Kinds[storage.KindImage],
		"application/x-executable", bytes.NewReader(jpegBytes()))
	if !errors.Is(err, storage.ErrUnsupportedType) {
		t.Fatalf("got %v, want ErrUnsupportedType", err)
	}
}

func TestSaveKindEnforcesTheSizeCeilingAfterASuccessfulSniff(t *testing.T) {
	s := newStorage(t)
	kind := storage.Kinds[storage.KindImage].Restrict(1, nil) // 1 byte is below any real image
	_, err := s.SaveKind(context.Background(), kind, "image/jpeg", bytes.NewReader(jpegBytes()))
	var tooLarge storage.ErrTooLarge
	if !errors.As(err, &tooLarge) {
		t.Fatalf("got %v, want ErrTooLarge", err)
	}
}

func TestSaveWrapsSaveKindWithTheImageKind(t *testing.T) {
	s := newStorage(t)
	url, err := s.Save(context.Background(), "image/png", bytes.NewReader(pngBytes()))
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if !strings.HasSuffix(url, ".png") {
		t.Fatalf("url %q does not end in .png", url)
	}
}
