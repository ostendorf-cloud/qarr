// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

// Package webapp builds the two http.Handlers qarr serves: the public one,
// the embedded SPA, and the admin one, govue's health, readiness and
// metrics surface. Both mirror govue's own example/app.go (*app).handler and
// (*app).adminHandler, trimmed to what a static SPA with no API yet needs.
package webapp

import (
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/ostendorf-cloud/govue/analytics"
	"github.com/ostendorf-cloud/govue/clientip"
	"github.com/ostendorf-cloud/govue/health"
	"github.com/ostendorf-cloud/govue/language"
	"github.com/ostendorf-cloud/govue/metrics"
	"github.com/ostendorf-cloud/govue/middleware"
	"github.com/ostendorf-cloud/qarr/internal/config"
	"github.com/ostendorf-cloud/qarr/internal/logos"
	"github.com/prometheus/client_golang/prometheus"
)

// Handler builds the public handler: the embedded SPA, served with
// http.FileServerFS, wrapped in Recover and RequestID. Recover sits
// outermost so it catches a panic from anything below it, RequestID
// included; see govue's own example/app.go for why.
//
// The pages are the prerendered files the sitemap lists, each an exact
// pattern: the start page and the imprint and privacy page of each language.
// "/" redirects to the start page of the visitor's language, and the legal
// short paths such as /impressum redirect through govue's language package.
// Those redirects are 302 answers, so the counter never sees a 200 for them.
// The build bakes https://qarr.de into the canonical and hreflang links and
// the sitemap; siteURL replaces that origin when the pages are loaded.
// Everything else falls to the file server of the catch-all, which serves
// the hashed assets and answers 404 for the rest. Handler fails when the
// sitemap or a page it lists is missing.
//
// views counts page views. It sits innermost, directly around the mux,
// because it reads r.Pattern, which only the mux sets and which RequestID's
// WithContext would hide from anything outside it. A counted view is
// reported as the pattern of the page, such as "/de/" or "/en/privacy", and
// nothing else: the path and the query of the request never leave the
// process. A nil views counts nothing.
//
// presets is where the preset logos come from, see internal/logos. Its two
// routes, /logos.json and /logos/{name}, answer on this origin and never
// redirect, which keeps the canvas that draws a preset untainted. They are
// not pages: the counter reports an HTML 200 only, and these answer JSON and
// images. A nil presets is a deployment without presets, whose listing is
// empty.
func Handler(dist fs.FS, siteURL *url.URL, logger *slog.Logger, views *analytics.Client, presets logos.Source) (http.Handler, error) {
	if presets == nil {
		presets = logos.Empty{}
	}
	s, err := loadSite(dist, siteURL)
	if err != nil {
		return nil, err
	}
	redirect, err := language.Redirect(language.Config{Languages: languages})
	if err != nil {
		return nil, fmt.Errorf("webapp: %w", err)
	}

	mux := http.NewServeMux()
	// "GET /{$}" matches the root alone, so a prefixed path never reaches
	// the redirect.
	mux.Handle("GET /{$}", redirect)
	// Without a method, the root would fall to the file server below for
	// every method but GET and HEAD, which answered a POST with the raw
	// template. The redirect answers 405 itself, but only for GET and HEAD.
	mux.Handle("/{$}", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
	}))
	s.mount(mux)
	// qarr sells nothing, so Terms stays off: /terms and /agb answer 404
	// instead of redirecting to a page that does not exist. The method-less
	// catch-all below is what lets these patterns coexist with it.
	if err := language.HandleLegal(mux, language.LegalConfig{Config: language.Config{Languages: languages}}, nil); err != nil {
		return nil, fmt.Errorf("webapp: %w", err)
	}
	logos.Register(mux, presets, logger)
	mux.Handle("/", noDirectoryListing(http.FileServerFS(dist)))

	chain := []middleware.Middleware{
		middleware.Recover(logger),
		middleware.RequestID(logger),
	}
	if views != nil {
		chain = append(chain, views.Middleware)
	}
	return middleware.Chain(mux, chain...), nil
}

// noDirectoryListing answers 404 for any path ending in "/" except the root.
// http.FileServerFS lists a directory that has no index.html with a 200 HTML
// page, which would be a page view and a listing of the bundle.
func noDirectoryListing(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && strings.HasSuffix(r.URL.Path, "/") {
			http.NotFound(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// NewViews builds the page view counter from the configuration. It is the
// one place the privacy relevant choices are made: the client address is
// resolved with the configured trusted proxies only, and it is masked, never
// sent whole (FullIP stays false). client may be nil for govue's default
// client; a test passes one with a fake transport.
func NewViews(cfg config.Config, logger *slog.Logger, registry prometheus.Registerer, client *http.Client) (*analytics.Client, error) {
	return analytics.New(cfg.Umami, analytics.Options{
		Hostname:   cfg.SiteURL.Hostname(),
		Logger:     logger,
		HTTPClient: client,
		ClientIP:   clientip.NewResolver(cfg.TrustedProxies),
		OnDrop: metrics.NewCounter(registry, "analytics_views_dropped_total",
			"Page views lost to a full queue or a shutdown before they reached Umami."),
	})
}

// AdminHandler builds the admin handler govue's httpserver.RunAdmin serves
// on the second, administrative listener: liveness and readiness probes and
// a Prometheus scrape, none of which this application's Ingress ever routes
// to.
//
// The middleware here is a deliberate, short list, not the public chain
// above with entries removed: a probe and a scrape are not browser traffic,
// so there is nothing for CORS or a CSRF protector to check, and a scraper
// polling this listener every few seconds must not be throttled by a rate
// limiter or fill an access log the way a public request would. Recover and
// RequestID stay, because a panic here is still worth catching and still
// worth a correlatable log line; see govue's own example/app.go
// (*app).adminHandler for the same reasoning.
func AdminHandler(reg *health.Registry, gatherer prometheus.Gatherer, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	reg.Handle(mux)
	mux.Handle("GET /metrics", metrics.Handler(gatherer))

	return middleware.Chain(mux,
		middleware.Recover(logger),
		middleware.RequestID(logger),
	)
}
