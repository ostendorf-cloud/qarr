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
	"net/url"

	"github.com/ostendorf-cloud/govue/analytics"
	"github.com/ostendorf-cloud/govue/clientip"
	"github.com/ostendorf-cloud/govue/envconf"
)

// DefaultSiteURL is the public origin used when SITE_URL is unset. It is also
// the origin the web build bakes into the prerendered pages and the sitemap
// (web/src/entry-prerender.ts), which the server replaces by SITE_URL.
const DefaultSiteURL = "https://qarr.de"

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
	// SiteURL is the public origin of this deployment (SITE_URL). The
	// canonical and hreflang links and the sitemap are built from it, and its
	// host is sent to Umami as the hostname of every view.
	SiteURL *url.URL
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

	l := envconf.New(getenv)
	var problems []error

	umami, err := analytics.LoadConfig(getenv)
	if err != nil {
		problems = append(problems, err)
	}
	cfg.Umami = umami
	siteURL, err := loadSiteURL(l)
	if err != nil {
		problems = append(problems, err)
	}
	cfg.SiteURL = siteURL
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

// loadSiteURL reads SITE_URL through govue's envconf, which requires an
// absolute http or https URL without credentials, query or fragment, then
// adds the rules of an origin: no path, and plain http only for a loopback
// host. The value is not echoed.
func loadSiteURL(l *envconf.Loader) (*url.URL, error) {
	u := l.URL("SITE_URL", DefaultSiteURL)
	if err := l.Err(); err != nil {
		return nil, err
	}
	if u.Path != "" {
		return nil, errors.New("SITE_URL: must be an origin without a path")
	}
	if u.Scheme == "http" {
		switch u.Hostname() {
		case "localhost", "127.0.0.1", "::1":
		default:
			return nil, errors.New("SITE_URL: http is allowed for localhost only, use https")
		}
	}
	return u, nil
}

// valueOrDefault returns value unless it is empty, in which case it returns
// def.
func valueOrDefault(value, def string) string {
	if value == "" {
		return def
	}
	return value
}
