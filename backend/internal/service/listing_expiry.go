package service

import (
	"context"
	"fmt"
	"time"

	"github.com/samandar-hodiev/Rent-House/backend/internal/repository"
	"github.com/samandar-hodiev/Rent-House/backend/pkg/logger"
)

// expirySweepInterval is how often listings are checked for expiry.
//
// Hourly rather than by the minute: the setting is measured in days, so an
// hour's imprecision is invisible, and a sweep that runs sixty times as often
// would be sixty times the queries for the same outcome.
const expirySweepInterval = time.Hour

// ListingExpiry closes listings that have been published longer than the
// marketplace allows.
//
// A sweep rather than a check on read: a listing that has expired must be gone
// from search, from the map and from its own page, and there is no single read
// path that covers all three. Closing the row once is what makes it true
// everywhere.
type ListingExpiry struct {
	apartments *repository.ApartmentRepository
	settings   *SettingsService
	now        func() time.Time
}

func NewListingExpiry(
	apartments *repository.ApartmentRepository, settings *SettingsService,
) *ListingExpiry {
	return &ListingExpiry{apartments: apartments, settings: settings, now: time.Now}
}

// Run sweeps until the context is cancelled. One sweep happens immediately, so
// a server that has been down past an expiry date does not wait an hour to
// catch up.
func (e *ListingExpiry) Run(ctx context.Context) {
	ticker := time.NewTicker(expirySweepInterval)
	defer ticker.Stop()

	for {
		if closed, err := e.Sweep(ctx); err != nil {
			logger.Errorf("listing expiry: %v", err)
		} else if closed > 0 {
			logger.Infof("listing expiry: closed %d listing(s)", closed)
		}

		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// Sweep closes every listing past its expiry and reports how many.
//
// Does nothing at all while the setting is off, which is the default: a
// marketplace that never asked for expiry must not quietly start closing
// listings that have been up for a month.
func (e *ListingExpiry) Sweep(ctx context.Context) (int64, error) {
	settings, err := e.settings.Get(ctx)
	if err != nil {
		return 0, err
	}
	if !settings.ListingAutoExpire || settings.ListingExpirationDays < 1 {
		return 0, nil
	}

	cutoff := e.now().UTC().AddDate(0, 0, -settings.ListingExpirationDays)
	closed, err := e.apartments.CloseExpired(ctx, cutoff)
	if err != nil {
		return 0, fmt.Errorf("close expired listings: %w", err)
	}
	return closed, nil
}
