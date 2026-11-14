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

	"github.com/ostendorf-cloud/govue/health"
	"github.com/ostendorf-cloud/govue/metrics"
	"github.com/ostendorf-cloud/govue/middleware"
	"github.com/prometheus/client_golang/prometheus"
)

// Handler builds the public handler: the embedded SPA, served with
// http.FileServerFS, wrapped in Recover and RequestID. Recover sits
// outermost so it catches a panic from anything below it, RequestID
// included; see govue's own example/app.go for why.
func Handler(dist fs.FS, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/", http.FileServerFS(dist))

	return middleware.Chain(mux,
		middleware.Recover(logger),
		middleware.RequestID(logger),
	)
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
