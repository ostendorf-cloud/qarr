// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/ostendorf-cloud/qarr/internal/webapp"
)

// TestEmbeddedDistBuildsAWorkingHandler proves the embedded dist filesystem
// is shaped the way main expects, without starting a server or binding a
// port: a build with an empty or mis-shaped frontend build fails here
// instead of at a request.
func TestEmbeddedDistBuildsAWorkingHandler(t *testing.T) {
	dist, err := fs.Sub(distFS, "dist")
	if err != nil {
		t.Fatalf("fs.Sub(distFS, \"dist\") error = %v", err)
	}

	if _, err := fs.Stat(dist, "index.html"); err != nil {
		t.Fatalf("embedded dist has no index.html: %v", err)
	}

	// The real prerender output must load as a site: the sitemap, the start
	// page and the legal pages of both languages.
	handler, err := webapp.Handler(dist, &url.URL{Scheme: "https", Host: "qarr.de"}, slog.New(slog.DiscardHandler), nil)
	if err != nil {
		t.Fatalf("webapp.Handler on the embedded dist: %v", err)
	}
	for _, path := range []string{"/de/", "/en/", "/de/imprint", "/en/imprint", "/de/privacy", "/en/privacy"} {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			t.Errorf("GET %s = %d, want 200", path, rec.Code)
		}
	}
}

func TestParseLevel(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		level   string
		wantErr bool
	}{
		{name: "debug", level: "debug"},
		{name: "info", level: "info"},
		{name: "warn", level: "warn"},
		{name: "error", level: "error"},
		{name: "unknown", level: "trace", wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			_, err := parseLevel(tc.level)
			if tc.wantErr && err == nil {
				t.Fatalf("parseLevel(%q) = nil error, want one", tc.level)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("parseLevel(%q) returned unexpected error: %v", tc.level, err)
			}
		})
	}
}
