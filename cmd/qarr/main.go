// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

// Command qarr serves the qarr single page application: QR codes with your
// own content, colours and logo, generated in the browser. This milestone
// serves the static SPA shell only; see AGENTS.md for what comes later.
package main

import (
	"context"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ostendorf-cloud/govue/analytics"
	"github.com/ostendorf-cloud/govue/clientip"
	"github.com/ostendorf-cloud/govue/health"
	"github.com/ostendorf-cloud/govue/httpserver"
	"github.com/ostendorf-cloud/govue/metrics"
	"github.com/ostendorf-cloud/qarr/internal/config"
	"github.com/ostendorf-cloud/qarr/internal/webapp"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}

	level, err := parseLevel(cfg.LogLevel)
	if err != nil {
		return err
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))

	dist, err := fs.Sub(distFS, "dist")
	if err != nil {
		return fmt.Errorf("qarr: %w", err)
	}

	// No check is registered yet: there is no dependency to check. A real
	// one is added once the bucket client exists, see AGENTS.md.
	healthRegistry := health.New()
	metricsRegistry := metrics.NewRegistry()

	views, err := analytics.New(cfg.Umami, analytics.Options{
		Hostname: cfg.SiteHost,
		Logger:   logger,
		ClientIP: clientip.NewResolver(cfg.TrustedProxies),
		OnDrop: metrics.NewCounter(metricsRegistry, "analytics_views_dropped_total",
			"Page views lost to a full queue or a shutdown before they reached Umami."),
	})
	if err != nil {
		return fmt.Errorf("qarr: %w", err)
	}
	// govue logs only failures, so the one startup line is ours. It names
	// no URL, which an operator may have put a secret into.
	if views.Enabled() {
		logger.Info("page view counting is on", "site_host", cfg.SiteHost)
	} else {
		logger.Info("page view counting is off: UMAMI_URL and UMAMI_WEBSITE_ID are not set")
	}

	handler := webapp.Handler(dist, logger, views)
	adminHandler := webapp.AdminHandler(healthRegistry, metricsRegistry, logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	runErr := httpserver.RunAdmin(ctx, httpserver.Config{
		Addr:    cfg.Addr,
		Handler: handler,
		Logger:  logger,
		// Failing the readiness probe before the drain delay starts is what
		// lets a load balancer stop sending new requests before the server
		// stops accepting connections at all.
		BeforeShutdown: healthRegistry.Drain,
	}, httpserver.AdminConfig{
		Addr:    cfg.AdminAddr,
		Handler: adminHandler,
	})

	// The server has stopped: send the views still queued, within a bound.
	closeCtx, cancel := context.WithTimeout(context.Background(), analyticsCloseTimeout)
	defer cancel()
	if err := views.Close(closeCtx); err != nil {
		logger.Warn("page views still queued at shutdown were not all sent")
	}
	return runErr
}

// analyticsCloseTimeout bounds how long shutdown waits for queued page
// views to reach Umami.
const analyticsCloseTimeout = 5 * time.Second

// parseLevel maps config's own level names onto slog.Level. config.Load
// already rejects any value other than the four below, so the default case
// here is unreachable in practice; it still returns an error rather than
// silently falling back, in case that validation is ever loosened.
func parseLevel(level string) (slog.Level, error) {
	switch level {
	case "debug":
		return slog.LevelDebug, nil
	case "info":
		return slog.LevelInfo, nil
	case "warn":
		return slog.LevelWarn, nil
	case "error":
		return slog.LevelError, nil
	default:
		return 0, fmt.Errorf("qarr: unknown log level %q", level)
	}
}
