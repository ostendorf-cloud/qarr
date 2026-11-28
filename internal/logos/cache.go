// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package logos

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

const (
	// listingTTL is how long the served listing is kept in memory. A picture
	// added to or removed from the source shows up after this long at most.
	listingTTL = 60 * time.Second
	// listTimeout bounds one refresh of the listing. The refresh outlives the
	// request that started it, so it carries its own limit.
	listTimeout = 15 * time.Second
)

// listCache keeps the served listing of a source in memory for listingTTL.
// One refresh runs at a time: a request that finds the list expired while a
// refresh is under way gets the stale list, or waits when there is none yet.
type listCache struct {
	src    Source
	logger *slog.Logger
	now    func() time.Time

	mu      sync.Mutex
	entries []Entry   // the served entries of the last good refresh
	fetched time.Time // when that refresh finished
	have    bool      // entries holds a refresh, possibly an expired one
	flight  *flight   // the refresh under way, nil when none
}

// flight is one refresh. Its result is set before done is closed.
type flight struct {
	done    chan struct{}
	entries []Entry
	err     error
}

// get returns the served entries. A refresh that fails returns the stale list
// when there is one, and the error when there is not.
func (c *listCache) get(ctx context.Context) ([]Entry, error) {
	c.mu.Lock()
	if c.have && c.now().Sub(c.fetched) < listingTTL {
		entries := c.entries
		c.mu.Unlock()
		return entries, nil
	}
	if f := c.flight; f != nil {
		if c.have {
			entries := c.entries
			c.mu.Unlock()
			return entries, nil
		}
		c.mu.Unlock()
		select {
		case <-f.done:
			return f.entries, f.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	f := &flight{done: make(chan struct{})}
	c.flight = f
	c.mu.Unlock()

	// The refresh serves every request waiting on it, so the client that
	// started it leaving must not cancel it.
	rctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), listTimeout)
	entries, err := c.src.List(rctx)
	cancel()

	c.mu.Lock()
	c.flight = nil
	switch {
	case err == nil:
		c.entries, c.fetched, c.have = Served(entries), c.now(), true
		f.entries = c.entries
	case c.have:
		// The expired list is still a better answer than an error. The
		// next request tries again.
		c.logger.WarnContext(ctx, "refresh preset logo listing, serving the previous one", "err", err)
		f.entries = c.entries
	default:
		f.err = err
	}
	c.mu.Unlock()
	close(f.done)
	return f.entries, f.err
}

// has reports whether entries holds name.
func has(entries []Entry, name string) bool {
	for _, e := range entries {
		if e.Name == name {
			return true
		}
	}
	return false
}
