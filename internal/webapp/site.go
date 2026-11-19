// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package webapp

import (
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/ostendorf-cloud/qarr/internal/config"
)

// languages are the language codes of the site. web/src/i18n of govue holds
// the same two, and the prerender writes one directory per code.
var languages = []string{"de", "en"}

// requiredPages are the pages every language must have, the ones the
// govue-check-legal build step also demands.
var requiredPages = []string{"imprint", "privacy"}

const (
	sitemapFile = "sitemap.xml"
	// maxSitemapBytes is the 50 MiB limit of the sitemap protocol.
	maxSitemapBytes  = 50 << 20
	sitemapNamespace = "http://www.sitemaps.org/schemas/sitemap/0.9"
)

// pagePath is the one shape of a page path the site serves: a language
// prefix and at most one plain lower case segment. The start page of a
// language is "/de/".
var pagePath = regexp.MustCompile(`^/([a-z]{2,3})/([a-z]*)$`)

// sitePage is one prerendered page, ready to serve.
type sitePage struct {
	// pattern is the ServeMux pattern. It is exact, so ServeMux never
	// redirects between "/de/imprint" and "/de/imprint/".
	pattern string
	content []byte
}

// site is the prerender output: the pages the sitemap lists and the sitemap.
type site struct {
	pages   []sitePage
	sitemap []byte
}

// loadSite reads the sitemap of the prerender and every page it lists, once.
// The sitemap is the list of routes, so Go holds no second copy of the route
// table. A request path is never joined to a file name: the files are read
// here, by names built from the validated locs.
func loadSite(dist fs.FS, siteURL *url.URL) (*site, error) {
	raw, err := readLimited(dist, sitemapFile)
	if err != nil {
		return nil, fmt.Errorf("webapp: load site: %w", err)
	}
	raw = withOrigin(raw, siteURL)

	var doc struct {
		XMLName xml.Name
		URLs    []struct {
			Locs []string `xml:"loc"`
		} `xml:"url"`
	}
	if err := xml.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("webapp: load site: parse %s: %w", sitemapFile, err)
	}
	if doc.XMLName != (xml.Name{Space: sitemapNamespace, Local: "urlset"}) {
		return nil, fmt.Errorf("webapp: load site: %s is not a urlset in the sitemap namespace", sitemapFile)
	}

	s := &site{sitemap: raw}
	seen := map[string]bool{}
	var problems []error
	for _, u := range doc.URLs {
		if len(u.Locs) != 1 {
			problems = append(problems, fmt.Errorf("webapp: load site: a url of %s has %d loc elements, want 1", sitemapFile, len(u.Locs)))
			continue
		}
		page, path, err := loadPage(dist, siteURL, strings.TrimSpace(u.Locs[0]))
		if err != nil {
			problems = append(problems, err)
			continue
		}
		if seen[path] {
			problems = append(problems, fmt.Errorf("webapp: load site: %s is listed twice", path))
			continue
		}
		seen[path] = true
		s.pages = append(s.pages, page)
	}
	for _, lang := range languages {
		for _, name := range requiredPages {
			if !seen["/"+lang+"/"+name] {
				problems = append(problems, fmt.Errorf("webapp: load site: /%s/%s is not in %s", lang, name, sitemapFile))
			}
		}
		if !seen["/"+lang+"/"] {
			problems = append(problems, fmt.Errorf("webapp: load site: /%s/ is not in %s", lang, sitemapFile))
		}
	}
	if err := errors.Join(problems...); err != nil {
		return nil, err
	}
	return s, nil
}

// withOrigin replaces the origin the web build bakes into its output, the
// canonical and hreflang links of a page and the locs of the sitemap, by the
// configured site URL. With the default origin it changes nothing.
func withOrigin(content []byte, siteURL *url.URL) []byte {
	built := []byte(config.DefaultSiteURL + "/")
	want := []byte(strings.TrimSuffix(siteURL.String(), "/") + "/")
	return bytes.ReplaceAll(content, built, want)
}

func loadPage(dist fs.FS, siteURL *url.URL, loc string) (sitePage, string, error) {
	bad := func(reason string) (sitePage, string, error) {
		return sitePage{}, "", fmt.Errorf("webapp: load site: loc %q %s", loc, reason)
	}
	u, err := url.Parse(loc)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return bad("is not an absolute http or https URL")
	}
	if u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || u.User != nil {
		return bad("has a query, a fragment or userinfo")
	}
	m := pagePath.FindStringSubmatch(u.EscapedPath())
	if m == nil {
		return bad("is not a language prefix and at most one plain segment")
	}
	lang, name := m[1], m[2]
	known := false
	for _, code := range languages {
		known = known || code == lang
	}
	if !known {
		return bad("is not under a configured language")
	}

	file, pattern := lang+"/"+name+"/index.html", "GET /"+lang+"/"+name
	if name == "" {
		file, pattern = lang+"/index.html", "GET /"+lang+"/{$}"
	}
	content, err := fs.ReadFile(dist, file)
	if err != nil {
		return bad("has no page: " + err.Error())
	}
	return sitePage{pattern: pattern, content: withOrigin(content, siteURL)}, "/" + lang + "/" + name, nil
}

func readLimited(fsys fs.FS, name string) ([]byte, error) {
	f, err := fsys.Open(name)
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()
	raw, err := io.ReadAll(io.LimitReader(f, maxSitemapBytes+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > maxSitemapBytes {
		return nil, fmt.Errorf("%s is larger than %d bytes", name, maxSitemapBytes)
	}
	return raw, nil
}

// mount registers every page and the sitemap on mux.
func (s *site) mount(mux *http.ServeMux) {
	for _, p := range s.pages {
		mux.Handle(p.pattern, htmlHandler(p.content))
	}
	mux.HandleFunc("GET /"+sitemapFile, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		// A failed write means the client went away, there is nobody to tell.
		_, _ = w.Write(s.sitemap)
	})
}

func htmlHandler(content []byte) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		h := w.Header()
		h.Set("Content-Type", "text/html; charset=utf-8")
		h.Set("Cache-Control", "no-cache")
		_, _ = w.Write(content)
	})
}
