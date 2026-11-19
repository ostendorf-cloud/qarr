// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package webapp_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/ostendorf-cloud/govue/analytics"
	"github.com/ostendorf-cloud/qarr/internal/webapp"
)

const (
	umamiID   = "0a1b2c3d-0000-4000-8000-000000000001"
	visitorUA = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"
)

// fakeUmami is the transport standing in for Umami, so no socket is opened.
// When block is set, every post waits on it, which stands in for a Umami that
// never answers.
type fakeUmami struct {
	block chan struct{}

	mu    sync.Mutex
	posts []string
}

func (f *fakeUmami) RoundTrip(req *http.Request) (*http.Response, error) {
	if f.block != nil {
		select {
		case <-f.block:
		case <-req.Context().Done():
			return nil, req.Context().Err()
		}
	}
	body, _ := io.ReadAll(req.Body)
	f.mu.Lock()
	f.posts = append(f.posts, string(body))
	f.mu.Unlock()
	return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader("")), Request: req}, nil
}

func (f *fakeUmami) bodies() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.posts...)
}

// countingHandler builds the real public handler with counting on, posting
// to fake.
func countingHandler(t *testing.T, fake *fakeUmami) (http.Handler, *analytics.Client) {
	t.Helper()

	views, err := analytics.New(analytics.Config{
		URL:       "https://umami.example.test",
		WebsiteID: umamiID,
	}, analytics.Options{
		Hostname:   "qarr.example.test",
		Logger:     testLogger(),
		HTTPClient: &http.Client{Transport: fake},
	})
	if err != nil {
		t.Fatalf("analytics.New: %v", err)
	}

	dist := fstest.MapFS{
		"index.html": {Data: []byte("<!doctype html><title>qarr</title>")},
		"app.js":     {Data: []byte("console.log(1)")},
	}
	return webapp.Handler(dist, testLogger(), views), views
}

func visit(t *testing.T, h http.Handler, target string, header http.Header) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, target, nil)
	req.RemoteAddr = "203.0.113.7:4000"
	req.Header.Set("User-Agent", visitorUA)
	for k, v := range header {
		req.Header[k] = v
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func closeViews(t *testing.T, views *analytics.Client) {
	t.Helper()

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	if err := views.Close(ctx); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

func urlsOf(t *testing.T, posts []string) []any {
	t.Helper()

	var urls []any
	for _, post := range posts {
		var ev struct {
			Payload map[string]any `json:"payload"`
		}
		if err := json.Unmarshal([]byte(post), &ev); err != nil {
			t.Fatal(err)
		}
		urls = append(urls, ev.Payload["url"])
	}
	return urls
}

// TestHandler_CountsTheRoutePatternNeverWhatTheUserEncoded sends what a user
// might encode into a code, a WiFi password and a link, in the query, and
// proves Umami receives the pattern "/" and none of it. The page itself keeps
// that content in the URL fragment, which a browser never sends; this covers
// the case of a link made by hand or by another tool.
func TestHandler_CountsTheRoutePatternNeverWhatTheUserEncoded(t *testing.T) {
	t.Parallel()

	fake := &fakeUmami{}
	h, views := countingHandler(t, fake)

	target := "/?text=WIFI%3AS%3Ahome%3BP%3Ahunter2%3B%3B&url=https%3A%2F%2Fsecret.example%2Ftoken%3Dabc123&v=1"
	if rec := visit(t, h, target, nil); rec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", rec.Code)
	}
	closeViews(t, views)

	posts := fake.bodies()
	if len(posts) != 1 {
		t.Fatalf("got %d views, want 1: %v", len(posts), posts)
	}
	if got := urlsOf(t, posts); got[0] != "/" {
		t.Errorf("reported url = %v, want the route pattern /", got[0])
	}
	for _, leak := range []string{"hunter2", "WIFI", "secret.example", "abc123", "text=", "url=", "%3A"} {
		if strings.Contains(posts[0], leak) {
			t.Errorf("payload contains %q: %s", leak, posts[0])
		}
	}
}

// TestHandler_CountsOnlyPagesThroughTheRealChain proves that no asset, no
// miss, no redirect, no prefetch and no Do Not Track or Global Privacy
// Control visitor is counted, and a path that holds user content with no
// route of its own counts nothing and is not echoed.
func TestHandler_CountsOnlyPagesThroughTheRealChain(t *testing.T) {
	t.Parallel()

	fake := &fakeUmami{}
	h, views := countingHandler(t, fake)

	visit(t, h, "/", nil)                                          // counted
	visit(t, h, "/", http.Header{"Dnt": {"1"}})                    // Do Not Track
	visit(t, h, "/", http.Header{"Sec-Gpc": {"1"}})                // Global Privacy Control
	visit(t, h, "/", http.Header{"Sec-Purpose": {"prefetch"}})     // prefetch
	visit(t, h, "/app.js", nil)                                    // asset
	visit(t, h, "/index.html", nil)                                // redirect
	visit(t, h, "/WIFI:S:home;P:hunter2;;", nil)                   // no such page
	visit(t, h, "/", http.Header{"User-Agent": {"Googlebot/2.1"}}) // bot
	closeViews(t, views)

	posts := fake.bodies()
	if len(posts) != 1 {
		t.Fatalf("got %d views, want 1: %v", len(posts), posts)
	}
	if strings.Contains(posts[0], "hunter2") {
		t.Errorf("payload holds the path: %s", posts[0])
	}
}

// TestHandler_ASlowUmamiNeverDelaysAResponse blocks every post and proves the
// page is still served at once.
func TestHandler_ASlowUmamiNeverDelaysAResponse(t *testing.T) {
	t.Parallel()

	fake := &fakeUmami{block: make(chan struct{})}
	h, views := countingHandler(t, fake)
	t.Cleanup(func() {
		close(fake.block)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = views.Close(ctx)
	})

	start := time.Now()
	for range 20 {
		if rec := visit(t, h, "/", nil); rec.Code != http.StatusOK {
			t.Fatalf("GET status = %d, want 200", rec.Code)
		}
	}
	if took := time.Since(start); took > 2*time.Second {
		t.Fatalf("20 responses took %v with Umami blocked, want no wait", took)
	}
}

// TestHandler_CountingOffCountsNothing proves an unset pair is inert.
func TestHandler_CountingOffCountsNothing(t *testing.T) {
	t.Parallel()

	views, err := analytics.New(analytics.Config{}, analytics.Options{})
	if err != nil {
		t.Fatalf("analytics.New: %v", err)
	}
	dist := fstest.MapFS{"index.html": {Data: []byte("<!doctype html>")}}
	h := webapp.Handler(dist, testLogger(), views)

	if rec := visit(t, h, "/", nil); rec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", rec.Code)
	}
	if got := views.Stats(); got.Sent+got.Failed+got.Dropped != 0 {
		t.Errorf("stats = %+v, nothing may be queued", got)
	}
}
