package storage

import (
	"fmt"
	"path"
	"strings"
)

// The three shapes an attachment can take. They differ in what the UI does with
// them, in what types are accepted, and in how large they may be.
const (
	KindImage = "image"
	KindFile  = "file"
	KindAudio = "audio"
)

// Size ceilings, one per kind.
//
// Separate because the reasons differ: a photograph from a phone is a few
// megabytes, a contract might be larger, and a voice note that reaches ten
// megabytes is someone who forgot to press stop. Every limit is defined once,
// here, and the handler and the frontend both read it rather than restating it.
const (
	MaxImageBytes = 5 << 20  // 5 MiB
	MaxFileBytes  = 20 << 20 // 20 MiB
	MaxAudioBytes = 10 << 20 // 10 MiB
)

// Kind describes one category of upload.
type Kind struct {
	Name string
	// MaxBytes is the ceiling for this kind.
	MaxBytes int64
	// Folder is the subdirectory it is stored under, so images, documents and
	// recordings do not share one directory.
	Folder string
	// extensions maps an accepted MIME type to the extension the file is saved
	// with. An allow-list, not a block-list: anything unnamed is refused.
	//
	// The extension comes from this map and never from the client, so a file
	// called "invoice.pdf.exe" cannot keep the part that matters.
	extensions map[string]string
}

// Extension returns the extension for an accepted content type.
func (k Kind) Extension(contentType string) (string, bool) {
	extension, ok := k.extensions[normalizeContentType(contentType)]
	return extension, ok
}

// MimeTypes lists what this kind accepts, for the API to advertise and for the
// file picker to filter by.
func (k Kind) MimeTypes() []string {
	types := make([]string, 0, len(k.extensions))
	for mime := range k.extensions {
		types = append(types, mime)
	}
	return types
}

// Kinds is every accepted upload category.
//
// Deliberately conservative. No SVG: it is a document that can carry script,
// and browsers will execute it when served from our origin. No archives that
// are really executables, no office macros beyond the standard document types.
var Kinds = map[string]Kind{
	KindImage: {
		Name:     KindImage,
		MaxBytes: MaxImageBytes,
		Folder:   "images",
		extensions: map[string]string{
			"image/jpeg": ".jpg",
			"image/png":  ".png",
			"image/webp": ".webp",
			"image/gif":  ".gif",
		},
	},
	KindFile: {
		Name:     KindFile,
		MaxBytes: MaxFileBytes,
		Folder:   "files",
		extensions: map[string]string{
			"application/pdf":    ".pdf",
			"application/msword": ".doc",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
			"application/vnd.ms-excel": ".xls",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
			"text/plain":                   ".txt",
			"application/zip":              ".zip",
			"application/x-zip-compressed": ".zip",
		},
	},
	KindAudio: {
		Name:     KindAudio,
		MaxBytes: MaxAudioBytes,
		Folder:   "audio",
		// What MediaRecorder actually produces varies by browser: Chrome and
		// Firefox give WebM (Opus), Safari gives MP4/AAC. All three are
		// accepted so recording works everywhere rather than only where the
		// developer happened to test.
		extensions: map[string]string{
			"audio/webm": ".webm",
			"audio/ogg":  ".ogg",
			"audio/mp4":  ".m4a",
			"audio/mpeg": ".mp3",
			"audio/wav":  ".wav",
			"audio/aac":  ".aac",
		},
	},
}

// Restrict narrows a category to what the marketplace currently allows.
//
// A copy, never a mutation of the shared Kind: the package-level allow-list is
// the widest the system will ever accept — what the schema and the browser can
// safely handle — and a setting can only make it narrower. Storage stays a sink
// that knows nothing about configuration; the caller decides the policy and
// hands the narrowed category in.
//
// `formats` are extension tokens without the dot ("jpg", "pdf"). An empty list
// leaves the types alone, so a misconfigured setting cannot make uploading
// impossible. `maxBytes` of zero leaves the ceiling alone, and a value above
// the built-in ceiling is ignored for the same reason.
func (k Kind) Restrict(maxBytes int64, formats []string) Kind {
	narrowed := k
	if maxBytes > 0 && maxBytes < k.MaxBytes {
		narrowed.MaxBytes = maxBytes
	}
	if len(formats) == 0 {
		return narrowed
	}

	allowed := make(map[string]bool, len(formats))
	for _, format := range formats {
		allowed["."+strings.ToLower(strings.TrimPrefix(strings.TrimSpace(format), "."))] = true
	}

	filtered := make(map[string]string, len(k.extensions))
	for mime, extension := range k.extensions {
		if allowed[extension] {
			filtered[mime] = extension
		}
	}
	if len(filtered) == 0 {
		// Every type filtered out means the setting names formats this build
		// does not support. Refusing everything would be worse than ignoring a
		// setting that cannot be satisfied.
		return narrowed
	}
	narrowed.extensions = filtered
	return narrowed
}

// KindFor returns the category by name.
func KindFor(name string) (Kind, bool) {
	kind, ok := Kinds[strings.ToLower(strings.TrimSpace(name))]
	return kind, ok
}

// KindForContentType finds the category that accepts a content type, so a
// caller can upload without saying which kind it is.
func KindForContentType(contentType string) (Kind, bool) {
	normalized := normalizeContentType(contentType)
	// Checked in a fixed order so a type listed under two kinds — none are
	// today — would always resolve the same way.
	for _, name := range []string{KindImage, KindAudio, KindFile} {
		kind := Kinds[name]
		if _, ok := kind.extensions[normalized]; ok {
			return kind, true
		}
	}
	return Kind{}, false
}

// SafeDisplayName sanitises the name shown in the UI and offered on download.
//
// The stored path never comes from this — it is generated — but the name is
// echoed back to both participants and used as the download filename, so it
// must not carry a path, a newline that could split a header, or a length that
// breaks a layout.
func SafeDisplayName(name, fallbackExtension string) string {
	// Any directory part is dropped: "../../etc/passwd" becomes "passwd".
	cleaned := path.Base(strings.ReplaceAll(strings.TrimSpace(name), `\`, "/"))
	cleaned = strings.Map(func(r rune) rune {
		// Control characters, including the CR and LF that would let a crafted
		// name inject a header on download.
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, cleaned)
	cleaned = strings.TrimSpace(cleaned)

	if cleaned == "" || cleaned == "." || cleaned == ".." {
		return "file" + fallbackExtension
	}
	if len(cleaned) > 120 {
		cleaned = cleaned[:120]
	}
	return cleaned
}

// ErrTooLarge is returned when an upload exceeds its kind's ceiling.
type ErrTooLarge struct {
	Kind     string
	MaxBytes int64
}

func (e ErrTooLarge) Error() string {
	return fmt.Sprintf("storage: %s exceeds %d bytes", e.Kind, e.MaxBytes)
}
