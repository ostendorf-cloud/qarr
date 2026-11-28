// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package logos

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"
	"testing/synctest"
	"time"
)

// fakeClock is the time source of a handler under test.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func newFakeClock() *fakeClock {
	return &fakeClock{t: time.Date(2026, time.November, 28, 12, 0, 0, 0, time.UTC)}
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

// timed is a handler with a fake clock, behind a mux like in production.
type timed struct {
	mux   *http.ServeMux
	clock *fakeClock
	logs  *bytes.Buffer
}

func newTimed(t *testing.T, src Source) *timed {
	t.Helper()
	logs := &bytes.Buffer{}
	clock := newFakeClock()
	mux := http.NewServeMux()
	register(mux, newHandler(src, slog.New(slog.NewTextHandler(logs, nil)), clock.Now))
	return &timed{mux: mux, clock: clock, logs: logs}
}

func (h *timed) get(t *testing.T, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.mux.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, target, nil))
	return rec
}

func listedNames(t *testing.T, rec *httptest.ResponseRecorder) []string {
	t.Helper()
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body listing
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not the listing: %v", err)
	}
	out := make([]string, 0, len(body.Logos))
	for _, l := range body.Logos {
		out = append(out, l.Name)
	}
	return out
}

func TestHandler_ListIsKeptForItsLifetime(t *testing.T) {
	t.Parallel()
	src := &fakeSource{entries: []Entry{{Name: "a.png", Size: 1}}}
	h := newTimed(t, src)

	if got := listedNames(t, h.get(t, ListPath)); !slices.Equal(got, []string{"a.png"}) {
		t.Fatalf("first listing = %v", got)
	}
	src.set([]Entry{{Name: "a.png", Size: 1}, {Name: "b.png", Size: 1}}, nil)

	h.clock.Advance(listingTTL - time.Nanosecond)
	if got := listedNames(t, h.get(t, ListPath)); !slices.Equal(got, []string{"a.png"}) {
		t.Errorf("listing inside the lifetime = %v, want the kept one", got)
	}
	if got := src.calls(); got != 1 {
		t.Errorf("source listed %d times inside the lifetime, want 1", got)
	}

	h.clock.Advance(time.Nanosecond)
	if got := listedNames(t, h.get(t, ListPath)); !slices.Equal(got, []string{"a.png", "b.png"}) {
		t.Errorf("listing after the lifetime = %v, want the new one", got)
	}
	if got := src.calls(); got != 2 {
		t.Errorf("source listed %d times, want 2", got)
	}
}

func TestHandler_ListAndPicturesShareTheCache(t *testing.T) {
	t.Parallel()
	src := &fakeSource{files: map[string]string{"a.png": "a", "b.png": "b"}}
	h := newTimed(t, src)

	h.get(t, ListPath)
	for _, target := range []string{"/logos/a.png", "/logos/b.png", "/logos/a.png", ListPath} {
		if rec := h.get(t, target); rec.Code != http.StatusOK {
			t.Fatalf("GET %s = %d, want 200", target, rec.Code)
		}
	}
	if got := src.calls(); got != 1 {
		t.Errorf("source listed %d times for five requests, want 1", got)
	}
}

func TestHandler_PictureNotInTheListingNeverReachesTheSource(t *testing.T) {
	t.Parallel()
	src := &fakeSource{
		entries: []Entry{{Name: "a.png", Size: 1}, {Name: "huge.png", Size: MaxBytes + 1}},
		// Both exist at the source: only the listing keeps them back.
		files: map[string]string{"a.png": "a", "huge.png": "h", "unlisted.png": "u"},
	}
	h := newTimed(t, src)
	for _, name := range []string{"unlisted.png", "huge.png", "none.png"} {
		rec := h.get(t, "/logos/"+name)
		if rec.Code != http.StatusNotFound {
			t.Errorf("GET %s = %d, want 404", name, rec.Code)
		}
		if got := rec.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("GET %s Cache-Control = %q, want no-store", name, got)
		}
	}
	if len(src.opened) != 0 {
		t.Errorf("the source was asked for %v, want nothing", src.opened)
	}
	if rec := h.get(t, "/logos/a.png"); rec.Code != http.StatusOK {
		t.Errorf("GET a.png = %d, want 200", rec.Code)
	}
	if len(src.opened) != 1 || src.opened[0] != "a.png" {
		t.Errorf("the source was asked for %v, want only a.png", src.opened)
	}
}

func TestHandler_PictureAddedToTheSourceAppearsAfterTheLifetime(t *testing.T) {
	t.Parallel()
	src := &fakeSource{files: map[string]string{"a.png": "a", "new.png": "n"}, entries: []Entry{{Name: "a.png", Size: 1}}}
	h := newTimed(t, src)
	if rec := h.get(t, "/logos/new.png"); rec.Code != http.StatusNotFound {
		t.Fatalf("before the refresh = %d, want 404", rec.Code)
	}
	src.set([]Entry{{Name: "a.png", Size: 1}, {Name: "new.png", Size: 1}}, nil)
	h.clock.Advance(listingTTL)
	if rec := h.get(t, "/logos/new.png"); rec.Code != http.StatusOK {
		t.Errorf("after the refresh = %d, want 200", rec.Code)
	}
}

func TestHandler_ListErrorServesTheStaleListing(t *testing.T) {
	t.Parallel()
	src := &fakeSource{entries: []Entry{{Name: "a.png", Size: 1}}, files: map[string]string{"a.png": "a"}}
	h := newTimed(t, src)
	h.get(t, ListPath)

	src.set(nil, errors.New("bucket list answered 503 SlowDown"))
	h.clock.Advance(listingTTL)
	for _, target := range []string{ListPath, "/logos/a.png"} {
		rec := h.get(t, target)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET %s = %d, want 200 from the stale listing", target, rec.Code)
		}
	}
	if got := h.logs.String(); !bytes.Contains([]byte(got), []byte("SlowDown")) {
		t.Errorf("the refresh error was not logged: %q", got)
	}
	// Every request tries the source again, there is no negative cache.
	if got := src.calls(); got != 3 {
		t.Errorf("source listed %d times, want 3", got)
	}

	src.set([]Entry{{Name: "b.png", Size: 1}}, nil)
	if got := listedNames(t, h.get(t, ListPath)); !slices.Equal(got, []string{"b.png"}) {
		t.Errorf("listing after the source recovered = %v", got)
	}
}

func TestHandler_ListErrorWithoutAListing(t *testing.T) {
	t.Parallel()
	src := &fakeSource{listErr: errors.New("bucket list answered 403 AccessDenied")}
	h := newTimed(t, src)
	for _, target := range []string{ListPath, "/logos/a.png"} {
		if rec := h.get(t, target); rec.Code != http.StatusBadGateway {
			t.Errorf("GET %s = %d, want 502", target, rec.Code)
		}
	}
	// A failure is not kept: the next request asks the source again.
	if got := src.calls(); got != 2 {
		t.Errorf("source listed %d times, want 2", got)
	}
	src.set([]Entry{{Name: "a.png", Size: 1}}, nil)
	if got := listedNames(t, h.get(t, ListPath)); !slices.Equal(got, []string{"a.png"}) {
		t.Errorf("listing after the source recovered = %v", got)
	}
}

func TestHandler_OneRefreshAtATime(t *testing.T) {
	t.Parallel()

	t.Run("a cold cache makes the others wait", func(t *testing.T) {
		t.Parallel()
		synctest.Test(t, func(t *testing.T) {
			src := &fakeSource{entries: []Entry{{Name: "a.png", Size: 1}}, hold: make(chan struct{}), holdCall: 1}
			h := newTimed(t, src)

			const n = 5
			recs := make([]*httptest.ResponseRecorder, n)
			var wg sync.WaitGroup
			for i := range n {
				wg.Go(func() { recs[i] = h.get(t, ListPath) })
			}
			synctest.Wait() // the first call is held, the others wait on it
			if got := src.calls(); got != 1 {
				t.Fatalf("source listed %d times while one refresh was under way, want 1", got)
			}
			close(src.hold)
			wg.Wait()

			for i, rec := range recs {
				if got := listedNames(t, rec); !slices.Equal(got, []string{"a.png"}) {
					t.Errorf("request %d got %v", i, got)
				}
			}
			if got := src.calls(); got != 1 {
				t.Errorf("source listed %d times, want 1", got)
			}
		})
	})

	t.Run("an expired list is served stale while one refresh runs", func(t *testing.T) {
		t.Parallel()
		synctest.Test(t, func(t *testing.T) {
			// The first call fills the cache, the second one is held.
			src := &fakeSource{entries: []Entry{{Name: "a.png", Size: 1}}, hold: make(chan struct{}), holdCall: 2}
			h := newTimed(t, src)
			h.get(t, ListPath)

			src.set([]Entry{{Name: "b.png", Size: 1}}, nil)
			h.clock.Advance(listingTTL)

			var (
				wg     sync.WaitGroup
				leader *httptest.ResponseRecorder
			)
			wg.Go(func() { leader = h.get(t, ListPath) })
			synctest.Wait() // the refresh is held at the source

			for i := range 4 {
				if got := listedNames(t, h.get(t, ListPath)); !slices.Equal(got, []string{"a.png"}) {
					t.Errorf("request %d during the refresh got %v, want the stale list", i, got)
				}
			}
			if got := src.calls(); got != 2 {
				t.Errorf("source listed %d times while one refresh was under way, want 2 (fill and refresh)", got)
			}

			close(src.hold)
			wg.Wait()
			if got := listedNames(t, leader); !slices.Equal(got, []string{"b.png"}) {
				t.Errorf("the request that refreshed got %v, want the new list", got)
			}
			if got := listedNames(t, h.get(t, ListPath)); !slices.Equal(got, []string{"b.png"}) {
				t.Errorf("request after the refresh got %v, want the new list", got)
			}
		})
	})

	t.Run("a waiter that leaves does not cancel the refresh", func(t *testing.T) {
		t.Parallel()
		synctest.Test(t, func(t *testing.T) {
			src := &fakeSource{entries: []Entry{{Name: "a.png", Size: 1}}, hold: make(chan struct{}), holdCall: 1}
			h := newTimed(t, src)

			ctx, cancel := context.WithCancel(t.Context())
			var wg sync.WaitGroup
			var leaving *httptest.ResponseRecorder
			wg.Go(func() {
				leaving = httptest.NewRecorder()
				h.mux.ServeHTTP(leaving, httptest.NewRequestWithContext(ctx, http.MethodGet, ListPath, nil))
			})
			synctest.Wait()
			cancel() // the client that started the refresh leaves
			close(src.hold)
			wg.Wait()

			if got := listedNames(t, h.get(t, ListPath)); !slices.Equal(got, []string{"a.png"}) {
				t.Errorf("listing after the first client left = %v", got)
			}
			if got := src.calls(); got != 1 {
				t.Errorf("source listed %d times, want 1: the refresh outlives its client", got)
			}
		})
	})
}
