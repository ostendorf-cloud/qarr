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
	"strings"

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
	// Logos says where the preset logos come from. Neither source is
	// required: with none configured the page offers upload only.
	Logos Logos
}

// Logos is the preset logo source: a local directory or an S3 compatible
// bucket, never both.
type Logos struct {
	// Dir is a local directory holding the pictures (LOGOS_DIR). Empty when
	// unused.
	Dir string
	// S3 is a bucket holding the pictures. Its zero value means unused.
	S3 S3
}

// S3 is an S3 compatible bucket read with a read only key.
type S3 struct {
	// Endpoint is the base URL of the S3 API (LOGOS_S3_ENDPOINT), for
	// example "https://s3.example.org". Requests use the path style.
	Endpoint string
	// Bucket is the bucket name (LOGOS_S3_BUCKET).
	Bucket string
	// Region is the signing region (LOGOS_S3_REGION). Most S3 compatible
	// servers accept the default "us-east-1".
	Region string
	// Prefix limits the bucket to one key prefix (LOGOS_S3_PREFIX). Empty
	// means the whole bucket.
	Prefix string
	// AccessKeyID and SecretAccessKey are the read only credentials, from
	// LOGOS_S3_ACCESS_KEY_ID and LOGOS_S3_SECRET_ACCESS_KEY or their _FILE
	// twins.
	AccessKeyID     string
	SecretAccessKey string
}

// Configured reports whether a source is set at all.
func (l Logos) Configured() bool {
	return l.Dir != "" || l.S3.Bucket != ""
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
	logos, err := loadLogos(getenv)
	if err != nil {
		problems = append(problems, err)
	}
	cfg.Logos = logos
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

// s3Keys are the settings that only mean something for a bucket. Setting one
// without LOGOS_S3_BUCKET is a mistake worth naming, not a silent no source.
var s3Keys = []string{
	"LOGOS_S3_ENDPOINT", "LOGOS_S3_REGION", "LOGOS_S3_PREFIX",
	"LOGOS_S3_ACCESS_KEY_ID", "LOGOS_S3_ACCESS_KEY_ID_FILE",
	"LOGOS_S3_SECRET_ACCESS_KEY", "LOGOS_S3_SECRET_ACCESS_KEY_FILE",
}

// loadLogos reads the preset logo source. No setting at all is valid and
// means upload only. A directory and a bucket together, a bucket setting
// without a bucket, and a bucket without its endpoint or credentials are each
// reported. The credentials are never echoed.
func loadLogos(getenv func(string) string) (Logos, error) {
	l := envconf.New(getenv)
	logos := Logos{
		Dir: l.String("LOGOS_DIR", ""),
		S3: S3{
			Bucket:          l.String("LOGOS_S3_BUCKET", ""),
			Region:          l.String("LOGOS_S3_REGION", ""),
			Prefix:          strings.Trim(l.String("LOGOS_S3_PREFIX", ""), "/"),
			AccessKeyID:     l.SecretOrFile("LOGOS_S3_ACCESS_KEY_ID"),
			SecretAccessKey: l.SecretOrFile("LOGOS_S3_SECRET_ACCESS_KEY"),
		},
	}
	problems := []error{l.Err()}

	s3Set := logos.S3.Bucket != ""
	for _, key := range s3Keys {
		s3Set = s3Set || strings.TrimSpace(getenv(key)) != ""
	}
	switch {
	case logos.Dir != "" && s3Set:
		problems = append(problems, errors.New("LOGOS_DIR and LOGOS_S3_*: set one preset logo source, not both"))
	case s3Set:
		if logos.S3.Region == "" {
			logos.S3.Region = "us-east-1"
		}
		problems = append(problems, validateS3(&logos.S3, getenv)...)
	}
	return logos, errors.Join(problems...)
}

// validateS3 fills the endpoint and reports every missing bucket setting.
func validateS3(s *S3, getenv func(string) string) []error {
	var problems []error
	if s.Bucket == "" {
		problems = append(problems, errors.New("LOGOS_S3_BUCKET: is required when another LOGOS_S3_* setting is set"))
	}
	if strings.TrimSpace(getenv("LOGOS_S3_ENDPOINT")) == "" {
		problems = append(problems, errors.New("LOGOS_S3_ENDPOINT: is required when a bucket is configured"))
	} else {
		// A loader of its own, so a problem already found above is not
		// reported a second time.
		ul := envconf.New(getenv)
		if u := ul.URL("LOGOS_S3_ENDPOINT", ""); u != nil {
			s.Endpoint = u.String()
		} else {
			problems = append(problems, ul.Err())
		}
	}
	if s.AccessKeyID == "" {
		problems = append(problems, errors.New("LOGOS_S3_ACCESS_KEY_ID or LOGOS_S3_ACCESS_KEY_ID_FILE: is required when a bucket is configured"))
	}
	if s.SecretAccessKey == "" {
		problems = append(problems, errors.New("LOGOS_S3_SECRET_ACCESS_KEY or LOGOS_S3_SECRET_ACCESS_KEY_FILE: is required when a bucket is configured"))
	}
	return problems
}

// valueOrDefault returns value unless it is empty, in which case it returns
// def.
func valueOrDefault(value, def string) string {
	if value == "" {
		return def
	}
	return value
}
