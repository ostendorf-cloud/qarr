// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package webapp_test

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/ostendorf-cloud/qarr/internal/webapp"
)

// sitemapOf builds a sitemap listing the given locs.
func sitemapOf(locs ...string) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
	for _, loc := range locs {
		b.WriteString("<url><loc>" + loc + "</loc></url>")
	}
	b.WriteString("</urlset>")
	return b.String()
}

var allLocs = []string{
	"https://qarr.test/de/", "https://qarr.test/en/",
	"https://qarr.test/de/imprint", "https://qarr.test/en/imprint",
	"https://qarr.test/de/privacy", "https://qarr.test/en/privacy",
}

// siteFS is a stand-in for the prerendered dist: the pages and the sitemap
// the build writes, plus an asset.
func siteFS() fstest.MapFS {
	return fstest.MapFS{
		"index.html":              {Data: []byte("<!doctype html><title>template</title>")},
		"sitemap.xml":             {Data: []byte(sitemapOf(allLocs...))},
		"de/index.html":           {Data: []byte("page de home")},
		"en/index.html":           {Data: []byte("page en home")},
		"de/imprint/index.html":   {Data: []byte("page de imprint")},
		"en/imprint/index.html":   {Data: []byte("page en imprint")},
		"de/privacy/index.html":   {Data: []byte("page de privacy")},
		"en/privacy/index.html":   {Data: []byte("page en privacy")},
		"assets/app.js":           {Data: []byte("console.log(2)")},
		"de/secret/index.html":    {Data: []byte("not in the sitemap")},
		"de/imprint/other.html":   {Data: []byte("other")},
		"assets/nested/file.json": {Data: []byte("{}")},
	}
}

func newHandler(t *testing.T, dist fs.FS) http.Handler {
	t.Helper()
	h, err := webapp.Handler(dist, testLogger(), nil)
	if err != nil {
		t.Fatalf("Handler: %v", err)
	}
	return h
}

func get(t *testing.T, h http.Handler, target string, header http.Header) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, target, nil)
	for k, v := range header {
		req.Header[k] = v
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHandler_ServesEveryPageOfTheSitemapAtItsExactPath(t *testing.T) {
	t.Parallel()

	h := newHandler(t, siteFS())
	cases := map[string]string{
		"/de/":           "page de home",
		"/en/":           "page en home",
		"/de/imprint":    "page de imprint",
		"/en/imprint":    "page en imprint",
		"/de/privacy":    "page de privacy",
		"/en/privacy":    "page en privacy",
		"/assets/app.js": "console.log(2)",
	}
	for path, want := range cases {
		rec := get(t, h, path, nil)
		if rec.Code != http.StatusOK || rec.Body.String() != want {
			t.Errorf("GET %s = %d %q, want 200 %q", path, rec.Code, rec.Body.String(), want)
		}
	}
	if ct := get(t, h, "/en/privacy", nil).Header().Get("Content-Type"); ct != "text/html; charset=utf-8" {
		t.Errorf("page content type = %q", ct)
	}
	if rec := get(t, h, "/sitemap.xml", nil); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "/de/privacy") {
		t.Errorf("GET /sitemap.xml = %d, want the sitemap", rec.Code)
	}
}

func TestHandler_ServesNothingTheSitemapDoesNotList(t *testing.T) {
	t.Parallel()

	h := newHandler(t, siteFS())
	for _, path := range []string{
		"/de/secret",   // a file exists, the sitemap does not list it
		"/de/imprint/", // a trailing slash is not the page
		"/de/imprint/index.html",
		"/de/privacy/",
		"/de", // no trailing slash on the language root
		"/fr/",
		"/terms", // qarr has no terms page
		"/agb",
		"/de/terms",
		"/assets/",
		"/assets/nested/",
	} {
		rec := get(t, h, path, nil)
		if rec.Code == http.StatusOK {
			t.Errorf("GET %s = 200, want no page", path)
		}
	}
}

func TestHandler_RootRedirectsToTheLanguageOfTheVisitor(t *testing.T) {
	t.Parallel()

	h := newHandler(t, siteFS())
	cases := []struct {
		accept string
		want   string
	}{
		{"", "/de/"},
		{"en-GB,en;q=0.9", "/en/"},
		{"de-AT,de;q=0.9", "/de/"},
		{"fr", "/de/"},
	}
	for _, tc := range cases {
		rec := get(t, h, "/", http.Header{"Accept-Language": {tc.accept}})
		if rec.Code != http.StatusFound || rec.Header().Get("Location") != tc.want {
			t.Errorf("GET / with %q = %d %q, want 302 %s", tc.accept, rec.Code, rec.Header().Get("Location"), tc.want)
		}
	}
}

func TestHandler_LegalRoutesRedirectToTheMatchingLocalePage(t *testing.T) {
	t.Parallel()

	h := newHandler(t, siteFS())
	en := http.Header{"Accept-Language": {"en"}}
	cases := []struct {
		path   string
		header http.Header
		want   string
	}{
		{"/imprint", en, "/en/imprint"},
		{"/imprint", nil, "/de/imprint"},
		{"/privacy", en, "/en/privacy"},
		{"/privacy/", en, "/en/privacy"},
		// The German aliases always go to the German page.
		{"/impressum", en, "/de/imprint"},
		{"/impressum", nil, "/de/imprint"},
		{"/datenschutz", en, "/de/privacy"},
		{"/datenschutzerklaerung", en, "/de/privacy"},
	}
	for _, tc := range cases {
		rec := get(t, h, tc.path, tc.header)
		if rec.Code != http.StatusFound || rec.Header().Get("Location") != tc.want {
			t.Errorf("GET %s = %d %q, want 302 %s", tc.path, rec.Code, rec.Header().Get("Location"), tc.want)
		}
		if rec.Header().Get("Cache-Control") != "no-store" {
			t.Errorf("GET %s Cache-Control = %q, want no-store", tc.path, rec.Header().Get("Cache-Control"))
		}
		// The target must be a page the server serves.
		if rec.Header().Get("Location") == "" {
			continue
		}
		if next := get(t, h, rec.Header().Get("Location"), nil); next.Code != http.StatusOK {
			t.Errorf("GET %s lands on %s = %d, want 200", tc.path, rec.Header().Get("Location"), next.Code)
		}
	}

	// Terms are off: the paths are not registered, so they answer 404.
	for _, path := range []string{"/terms", "/agb"} {
		if rec := get(t, h, path, nil); rec.Code != http.StatusNotFound {
			t.Errorf("GET %s = %d, want 404, qarr has no terms", path, rec.Code)
		}
	}

	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/impressum", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST /impressum = %d, want 405", rec.Code)
	}
}

func TestHandler_FailsWhenTheSiteIsIncomplete(t *testing.T) {
	t.Parallel()

	without := func(drop string) fstest.MapFS {
		fsys := siteFS()
		delete(fsys, drop)
		return fsys
	}
	withSitemap := func(locs ...string) fstest.MapFS {
		fsys := siteFS()
		fsys["sitemap.xml"] = &fstest.MapFile{Data: []byte(sitemapOf(locs...))}
		return fsys
	}
	cases := map[string]fstest.MapFS{
		"no sitemap":                without("sitemap.xml"),
		"a listed page missing":     without("en/privacy/index.html"),
		"no privacy page":           withSitemap(append(append([]string{}, allLocs[:4]...), "https://qarr.test/de/", "https://qarr.test/en/")...),
		"a path outside a language": withSitemap(append(append([]string{}, allLocs...), "https://qarr.test/de/a/b")...),
		"a loc with a query":        withSitemap(append(append([]string{}, allLocs...), "https://qarr.test/de/imprint?x=1")...),
		"an unknown language":       withSitemap(append(append([]string{}, allLocs...), "https://qarr.test/fr/")...),
		"a duplicate loc":           withSitemap(append(append([]string{}, allLocs...), allLocs[0])...),
	}
	for name, dist := range cases {
		if _, err := webapp.Handler(dist, testLogger(), nil); err == nil {
			t.Errorf("%s: Handler returned no error", name)
		}
	}
}
