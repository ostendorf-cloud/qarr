// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

// Package config loads and validates qarr's own environment in one pass,
// collecting every problem into one error so a misconfigured deployment
// reports all of its mistakes at once instead of one per restart.
package config

import (
	"errors"
	"fmt"
	"net/netip"
	"strings"

	"github.com/ostendorf-cloud/govue/analytics"
	"github.com/ostendorf-cloud/govue/clientip"
)

// Config is every setting qarr reads from the environment.
type Config struct {
	// Addr is the public listener's address: the embedded SPA.
	Addr string
	// AdminAddr is govue's admin listener's address: health, readiness and
	// metrics, never reached through this app's own Ingress.
	AdminAddr string
	// LogLevel is one of "debug", "info", "warn" or "error".
	LogLevel string
	// Umami is govue's page view counting. It is off unless UMAMI_URL and
	// UMAMI_WEBSITE_ID are both set; one of the two alone is an error.
	Umami analytics.Config
	// SiteHost is the public host of this deployment, sent to Umami as the
	// hostname of every view. Required when counting is on.
	SiteHost string
	// TrustedProxies are the proxies whose X-Forwarded-For is believed when
	// the client address is resolved. Behind an ingress without it every
	// view comes from the proxy and none is counted.
	TrustedProxies []netip.Prefix
}

// validLogLevels are the values LogLevel accepts.
var validLogLevels = map[string]bool{
	"debug": true,
	"info":  true,
	"warn":  true,
	"error": true,
}

// Load reads every setting from the environment through getenv, so a test
// can pass a fake instead of the real process environment. Every field has a
// documented default; Load returns every validation problem at once rather
// than stopping at the first one.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Addr:      valueOrDefault(getenv("ADDR"), ":8080"),
		AdminAddr: valueOrDefault(getenv("ADMIN_ADDR"), ":8081"),
		LogLevel:  valueOrDefault(getenv("LOG_LEVEL"), "info"),
	}

	var problems []error

	umami, err := analytics.LoadConfig(getenv)
	if err != nil {
		problems = append(problems, err)
	}
	cfg.Umami = umami
	cfg.SiteHost = getenv("SITE_HOST")
	if cfg.Umami.Enabled() && cfg.SiteHost == "" {
		problems = append(problems, errors.New("SITE_HOST: required when UMAMI_URL and UMAMI_WEBSITE_ID are set"))
	}
	// The same rule govue applies to Options.Hostname: a bare host, so a
	// scheme, a path, userinfo, a query or a space is a mistake. A port is
	// accepted, as govue accepts it. The value is not echoed.
	if strings.ContainsAny(cfg.SiteHost, "/@?# \t") || strings.Contains(cfg.SiteHost, "://") {
		problems = append(problems, errors.New("SITE_HOST: must be a bare host such as qarr.example.com, with no scheme, path, query or spaces"))
	}
	proxies, err := clientip.ParseCIDRs(getenv("TRUSTED_PROXIES"))
	if err != nil {
		problems = append(problems, fmt.Errorf("TRUSTED_PROXIES: %w", err))
	}
	cfg.TrustedProxies = proxies
	if !validLogLevels[cfg.LogLevel] {
		problems = append(problems, fmt.Errorf("LOG_LEVEL: %q is not one of debug, info, warn, error", cfg.LogLevel))
	}

	if err := errors.Join(problems...); err != nil {
		return Config{}, fmt.Errorf("load config: %w", err)
	}
	return cfg, nil
}

// valueOrDefault returns value unless it is empty, in which case it returns
// def.
func valueOrDefault(value, def string) string {
	if value == "" {
		return def
	}
	return value
}
