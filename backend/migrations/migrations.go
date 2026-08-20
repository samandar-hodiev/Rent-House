// Package migrations embeds the SQL schema files.
//
// The embed lives here rather than in internal/database because go:embed cannot
// reach into a parent directory — and keeping the .sql files at
// backend/migrations/ is worth a three-line package.
package migrations

import "embed"

// FS holds every migration file, so a built binary carries its own schema.
//
//go:embed *.sql
var FS embed.FS
