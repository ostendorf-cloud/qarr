// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

// Package webapp builds the two http.Handlers qarr serves: the public one,
// the embedded SPA, and the admin one, govue's health, readiness and
// metrics surface. Both mirror govue's own example/app.go (*app).handler and
// (*app).adminHandler, trimmed to what a static SPA with no API yet needs.
package webapp

import (
	"io/fs"
	"log/slog"
	"net/http"
	"strings"

	"github.com/ostendorf-cloud/govue/analytics"
	"github.com/ostendorf-cloud/govue/clientip"
	"github.com/ostendorf-cloud/govue/health"
	"github.com/ostendorf-cloud/govue/metrics"
	"github.com/ostendorf-cloud/govue/middleware"
	"github.com/ostendorf-cloud/qarr/internal/config"
	"github.com/prometheus/client_golang/prometheus"
)

// Handler builds the public handler: the embedded SPA, served with
// http.FileServerFS, wrapped in Recover and RequestID. Recover sits
// outermost so it catches a panic from anything below it, RequestID
// included; see govue's own example/app.go for why.
//
// views counts page views. It sits innermost, directly around the mux,
// because it reads r.Pattern, which only the mux sets and which RequestID's
// WithContext would hide from anything outside it. The only pattern is "/",
// so a counted view is reported as "/" and nothing else: the path and the
// query of the request never leave the process. A nil views counts nothing.
func Handler(dist fs.FS, logger *slog.Logger, views *analytics.Client) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/", noDirectoryListing(http.FileServerFS(dist)))

	chain := []middleware.Middleware{
		middleware.Recover(logger),
		middleware.RequestID(logger),
	}
	if views != nil {
		chain = append(chain, views.Middleware)
	}
	return middleware.Chain(mux, chain...)
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
		Hostname:   cfg.SiteHost,
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
