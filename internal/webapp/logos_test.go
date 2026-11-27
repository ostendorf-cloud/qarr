// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package webapp_test

import (
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ostendorf-cloud/govue/analytics"
	"github.com/ostendorf-cloud/govue/metrics"
	"github.com/ostendorf-cloud/qarr/internal/config"
	"github.com/ostendorf-cloud/qarr/internal/logos"
	"github.com/ostendorf-cloud/qarr/internal/webapp"
)

// presetHandler builds the public handler on top of a directory holding one
// preset logo, with page view counting posting to fake.
func presetHandler(t *testing.T, fake *fakeUmami) (http.Handler, *analytics.Client) {
	t.Helper()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "acme.svg"), []byte("<svg/>"), 0o600); err != nil {
		t.Fatal(err)
	}
	presets, err := logos.NewDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	siteURL := &url.URL{Scheme: "https", Host: "qarr.test"}
	views, err := webapp.NewViews(config.Config{
		Umami:   analytics.Config{URL: "https://umami.example.test", WebsiteID: umamiID},
		SiteURL: siteURL,
	}, testLogger(), metrics.NewRegistry(), &http.Client{Transport: fake})
	if err != nil {
		t.Fatalf("NewViews: %v", err)
	}
	h, err := webapp.Handler(siteFS(), siteURL, testLogger(), views, presets)
	if err != nil {
		t.Fatalf("Handler: %v", err)
	}
	return h, views
}

func TestHandler_ServesPresetLogosOnItsOwnOrigin(t *testing.T) {
	t.Parallel()
	h, _ := presetHandler(t, &fakeUmami{})

	list := visit(t, h, "/logos.json", nil)
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), `"url":"/logos/acme.svg"`) {
		t.Errorf("listing = %d %q, want 200 with the picture", list.Code, list.Body.String())
	}
	if got := list.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("listing Cache-Control = %q, want no-store", got)
	}

	pic := visit(t, h, "/logos/acme.svg", nil)
	if pic.Code != http.StatusOK || pic.Body.String() != "<svg/>" {
		t.Errorf("picture = %d %q, want 200 with the file", pic.Code, pic.Body.String())
	}
	if got := pic.Header().Get("Cache-Control"); !strings.Contains(got, "max-age=") {
		t.Errorf("picture Cache-Control = %q, want a cache lifetime", got)
	}
	if got := pic.Header().Get("Location"); got != "" {
		t.Errorf("picture Location = %q: a preset is never a redirect", got)
	}
}

func TestHandler_PresetRoutesDoNotFallToTheSPA(t *testing.T) {
	t.Parallel()
	h, _ := presetHandler(t, &fakeUmami{})
	for _, target := range []string{"/logos/missing.png", "/logos/", "/logos/notes.txt"} {
		rec := visit(t, h, target, nil)
		if rec.Code != http.StatusNotFound {
			t.Errorf("GET %s = %d, want 404", target, rec.Code)
		}
		if strings.Contains(rec.Body.String(), "template") {
			t.Errorf("GET %s answered with the page template", target)
		}
	}
}

func TestHandler_WithoutPresetsTheListingIsEmpty(t *testing.T) {
	t.Parallel()
	h := newHandler(t, siteFS())
	rec := visit(t, h, "/logos.json", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != `{"logos":[]}` {
		t.Errorf("body = %s, want an empty list", got)
	}
	if rec := visit(t, h, "/logos/acme.svg", nil); rec.Code != http.StatusNotFound {
		t.Errorf("picture status = %d, want 404", rec.Code)
	}
}

// TestHandler_PresetRoutesAreNotPageViews proves a preset request is never
// reported to Umami, and that the same handler does report a page.
func TestHandler_PresetRoutesAreNotPageViews(t *testing.T) {
	t.Parallel()
	fake := &fakeUmami{}
	h, views := presetHandler(t, fake)

	visit(t, h, "/logos.json", nil)
	visit(t, h, "/logos/acme.svg", nil)
	visit(t, h, "/logos/missing.png", nil)
	visit(t, h, "/en/", nil)
	closeViews(t, views)

	got := urlsOf(t, fake.bodies())
	if len(got) != 1 || got[0] != "/en/" {
		t.Errorf("reported urls = %v, want only /en/", got)
	}
}
