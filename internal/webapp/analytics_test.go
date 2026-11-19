// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package webapp_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/ostendorf-cloud/govue/analytics"
	"github.com/ostendorf-cloud/govue/metrics"
	"github.com/ostendorf-cloud/qarr/internal/config"
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
	return countingHandlerWith(t, fake, nil)
}

// countingHandlerWith is countingHandler with trusted proxies, built through
// webapp.NewViews, the function main uses.
func countingHandlerWith(t *testing.T, fake *fakeUmami, trusted []netip.Prefix) (http.Handler, *analytics.Client) {
	t.Helper()

	views, err := webapp.NewViews(config.Config{
		Umami:          analytics.Config{URL: "https://umami.example.test", WebsiteID: umamiID},
		SiteHost:       "qarr.example.test",
		TrustedProxies: trusted,
	}, testLogger(), metrics.NewRegistry(), &http.Client{Transport: fake})
	if err != nil {
		t.Fatalf("NewViews: %v", err)
	}

	dist := siteFS()
	dist["app.js"] = &fstest.MapFile{Data: []byte("console.log(1)")}
	h, err := webapp.Handler(dist, testLogger(), views)
	if err != nil {
		t.Fatalf("Handler: %v", err)
	}
	return h, views
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

	target := "/de/?text=WIFI%3AS%3Ahome%3BP%3Ahunter2%3B%3B&url=https%3A%2F%2Fsecret.example%2Ftoken%3Dabc123&v=1"
	if rec := visit(t, h, target, nil); rec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", rec.Code)
	}
	closeViews(t, views)

	posts := fake.bodies()
	if len(posts) != 1 {
		t.Fatalf("got %d views, want 1: %v", len(posts), posts)
	}
	if got := urlsOf(t, posts); got[0] != "/de/" {
		t.Errorf("reported url = %v, want the route pattern /de/", got[0])
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

	visit(t, h, "/de/", nil)                                          // counted
	visit(t, h, "/de/", http.Header{"Dnt": {"1"}})                    // Do Not Track
	visit(t, h, "/de/", http.Header{"Sec-Gpc": {"1"}})                // Global Privacy Control
	visit(t, h, "/de/", http.Header{"Sec-Purpose": {"prefetch"}})     // prefetch
	visit(t, h, "/assets/", nil)                                      // directory listing
	visit(t, h, "/app.js", nil)                                       // asset
	visit(t, h, "/index.html", nil)                                   // redirect
	visit(t, h, "/", nil)                                             // language redirect
	visit(t, h, "/WIFI:S:home;P:hunter2;;", nil)                      // no such page
	visit(t, h, "/de/", http.Header{"User-Agent": {"Googlebot/2.1"}}) // bot
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
		if rec := visit(t, h, "/de/", nil); rec.Code != http.StatusOK {
			t.Fatalf("GET status = %d, want 200", rec.Code)
		}
	}
	if took := time.Since(start); took > 2*time.Second {
		t.Fatalf("20 responses took %v with Umami blocked, want no wait", took)
	}
}

// TestNewViews_MasksTheAddressAndTrustsOnlyTheConfiguredProxies proves the
// address Umami receives is the masked client address: the forwarded client
// behind a trusted proxy, the TCP peer when the peer is not trusted (a forged
// X-Forwarded-For is ignored), and never the whole address.
func TestNewViews_MasksTheAddressAndTrustsOnlyTheConfiguredProxies(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		trusted []netip.Prefix
		peer    string
		xff     string
		wantIP  string
	}{
		{name: "no proxy trusted, peer is the client", peer: "203.0.113.77:4000", wantIP: "203.0.113.0"},
		{
			name:    "trusted proxy, forwarded client",
			trusted: []netip.Prefix{netip.MustParsePrefix("198.51.100.0/24")},
			peer:    "198.51.100.9:4000", xff: "192.0.2.200", wantIP: "192.0.2.0",
		},
		{
			name:    "untrusted peer, forged header ignored",
			trusted: []netip.Prefix{netip.MustParsePrefix("198.51.100.0/24")},
			peer:    "203.0.113.77:4000", xff: "192.0.2.200", wantIP: "203.0.113.0",
		},
		{name: "IPv6 is masked to its /48", peer: "[2001:db8:1234:5678::9]:4000", wantIP: "2001:db8:1234::"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			fake := &fakeUmami{}
			h, views := countingHandlerWith(t, fake, tc.trusted)

			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/de/", nil)
			req.RemoteAddr = tc.peer
			req.Header.Set("User-Agent", visitorUA)
			if tc.xff != "" {
				req.Header.Set("X-Forwarded-For", tc.xff)
			}
			h.ServeHTTP(httptest.NewRecorder(), req)
			closeViews(t, views)

			posts := fake.bodies()
			if len(posts) != 1 {
				t.Fatalf("got %d views, want 1: %v", len(posts), posts)
			}
			var ev struct {
				Payload map[string]any `json:"payload"`
			}
			if err := json.Unmarshal([]byte(posts[0]), &ev); err != nil {
				t.Fatal(err)
			}
			if got := ev.Payload["ip"]; got != tc.wantIP {
				t.Errorf("reported ip = %v, want %s", got, tc.wantIP)
			}
		})
	}
}

// TestHandler_CountingOffCountsNothing proves an unset pair is inert.
func TestHandler_CountingOffCountsNothing(t *testing.T) {
	t.Parallel()

	views, err := analytics.New(analytics.Config{}, analytics.Options{})
	if err != nil {
		t.Fatalf("analytics.New: %v", err)
	}
	h, err := webapp.Handler(siteFS(), testLogger(), views)
	if err != nil {
		t.Fatalf("Handler: %v", err)
	}

	if rec := visit(t, h, "/de/", nil); rec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", rec.Code)
	}
	if got := views.Stats(); got.Sent+got.Failed+got.Dropped != 0 {
		t.Errorf("stats = %+v, nothing may be queued", got)
	}
}

// TestHandler_CountsLegalPagesByRouteAndNeverTheRedirects proves a legal page
// is reported as its own route, and that the short paths and the German
// aliases, which only redirect, are not counted at all. The privacy
// statement says redirects are not counted.
func TestHandler_CountsLegalPagesByRouteAndNeverTheRedirects(t *testing.T) {
	t.Parallel()

	fake := &fakeUmami{}
	h, views := countingHandler(t, fake)

	visit(t, h, "/en/privacy", nil)  // counted
	visit(t, h, "/de/imprint", nil)  // counted
	visit(t, h, "/imprint", nil)     // redirect
	visit(t, h, "/privacy", nil)     // redirect
	visit(t, h, "/impressum", nil)   // German alias
	visit(t, h, "/datenschutz", nil) // German alias
	visit(t, h, "/datenschutzerklaerung", nil)
	visit(t, h, "/agb", nil) // no terms, 404
	closeViews(t, views)

	got := urlsOf(t, fake.bodies())
	if len(got) != 2 {
		t.Fatalf("got %d views, want 2: %v", len(got), got)
	}
	seen := map[any]bool{got[0]: true, got[1]: true}
	if !seen["/en/privacy"] || !seen["/de/imprint"] {
		t.Errorf("reported urls = %v, want /en/privacy and /de/imprint", got)
	}
}
