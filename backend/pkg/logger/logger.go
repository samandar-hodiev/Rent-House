// Package logger provides the application's shared loggers.
//
// It wraps the standard library's log package rather than pulling in a logging
// dependency: the backend only needs levelled, timestamped lines on stdout and
// stderr, which log.Logger already does.
package logger

import (
	"io"
	"log"
	"os"
)

var (
	infoLogger  = log.New(os.Stdout, "INFO  ", log.LstdFlags|log.Lmsgprefix)
	errorLogger = log.New(os.Stderr, "ERROR ", log.LstdFlags|log.Lmsgprefix)
)

// SwapOutput redirects both loggers to w and returns a function restoring the
// previous destinations.
//
// It exists so a test can assert on what was logged — in particular that a log
// line carries what an operator needs and none of what they must never see.
// Tests only; nothing in the running application calls it.
func SwapOutput(w io.Writer) func() {
	infoLogger.SetOutput(w)
	errorLogger.SetOutput(w)
	return func() {
		infoLogger.SetOutput(os.Stdout)
		errorLogger.SetOutput(os.Stderr)
	}
}

// Infof writes an informational line to stdout.
func Infof(format string, args ...any) {
	infoLogger.Printf(format, args...)
}

// Errorf writes an error line to stderr.
func Errorf(format string, args ...any) {
	errorLogger.Printf(format, args...)
}

// Fatalf writes an error line to stderr and exits with a non-zero status.
// Reserved for startup failures the process cannot recover from.
func Fatalf(format string, args ...any) {
	errorLogger.Printf(format, args...)
	os.Exit(1)
}
