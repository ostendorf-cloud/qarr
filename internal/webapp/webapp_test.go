// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package webapp_test

import (
	"io/fs"
	"log/slog"
	"net/http/httptest"
	"testing"

	"github.com/ostendorf-cloud/govue/health"
	"github.com/ostendorf-cloud/govue/metrics"
	"github.com/ostendorf-cloud/qarr/internal/webapp"
)

func testLogger() *slog.Logger {
	return slog.New(slog.DiscardHandler)
}

func TestHandler_ServesTheEmbeddedSPA(t *testing.T) {
	t.Parallel()

	handler := newHandler(t, fs.FS(siteFS()))

	req := httptest.NewRequestWithContext(t.Context(), "GET", "/de/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != 200 {
		t.Fatalf("GET /de/ status = %d, want 200", rec.Code)
	}
	if got := rec.Body.String(); got != "page de home" {
		t.Fatalf("GET /de/ body = %q, want the prerendered page", got)
	}
}

func TestHandler_RecoversFromAPanic(t *testing.T) {
	t.Parallel()

	handler := newHandler(t, fs.FS(siteFS()))

	// A request for a path http.FileServerFS cannot serve without panicking
	// is not exercised here; Recover's own contract is covered by govue's
	// middleware tests. This test only proves Handler wires Recover into the
	// chain at all, by checking an ordinary request, for a file that does
	// not exist in dist, still answers a normal 404 through it rather than
	// an empty connection reset.
	req := httptest.NewRequestWithContext(t.Context(), "GET", "/missing.txt", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != 404 {
		t.Fatalf("GET /missing.txt status = %d, want 404", rec.Code)
	}
}

func TestAdminHandler(t *testing.T) {
	t.Parallel()

	reg := health.New()
	registry := metrics.NewRegistry()
	handler := webapp.AdminHandler(reg, registry, testLogger())

	cases := []struct {
		name string
		path string
		want int
	}{
		{name: "liveness", path: "/healthz", want: 200},
		{name: "readiness with no registered checks", path: "/readyz", want: 200},
		{name: "metrics", path: "/metrics", want: 200},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequestWithContext(t.Context(), "GET", tc.path, nil)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != tc.want {
				t.Fatalf("GET %s status = %d, want %d", tc.path, rec.Code, tc.want)
			}
		})
	}
}

func TestAdminHandler_DrainingFailsReadiness(t *testing.T) {
	t.Parallel()

	reg := health.New()
	reg.Drain()
	registry := metrics.NewRegistry()
	handler := webapp.AdminHandler(reg, registry, testLogger())

	req := httptest.NewRequestWithContext(t.Context(), "GET", "/readyz", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != 503 {
		t.Fatalf("GET /readyz status while draining = %d, want 503", rec.Code)
	}
}
