// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package config_test

import (
	"net/netip"
	"reflect"
	"strings"
	"testing"

	"github.com/ostendorf-cloud/qarr/internal/config"
)

const (
	umamiURL = "https://umami.example.test"
	umamiID  = "0a1b2c3d-0000-4000-8000-000000000001"
)

func TestLoad_Umami(t *testing.T) {
	t.Parallel()

	off, err := config.Load(env(nil))
	if err != nil || off.Umami.Enabled() {
		t.Fatalf("no UMAMI_ variables: enabled = %v, err = %v, want off and no error", off.Umami.Enabled(), err)
	}

	on, err := config.Load(env(map[string]string{
		"UMAMI_URL": umamiURL, "UMAMI_WEBSITE_ID": umamiID, "SITE_URL": "https://qarr.example.test:8443",
		"TRUSTED_PROXIES": "10.0.0.0/8",
	}))
	if err != nil {
		t.Fatalf("Load() with the full set: %v", err)
	}
	if !on.Umami.Enabled() || on.SiteURL.String() != "https://qarr.example.test:8443" {
		t.Fatalf("Load() = %+v, want counting on for https://qarr.example.test:8443", on)
	}
	if on.SiteURL.Hostname() != "qarr.example.test" {
		t.Fatalf("SiteURL.Hostname() = %q, want the bare host", on.SiteURL.Hostname())
	}
	if off.SiteURL.String() != config.DefaultSiteURL {
		t.Fatalf("SiteURL default = %q, want %q", off.SiteURL, config.DefaultSiteURL)
	}
	if want := []netip.Prefix{netip.MustParsePrefix("10.0.0.0/8")}; !reflect.DeepEqual(on.TrustedProxies, want) {
		t.Fatalf("TrustedProxies = %v, want %v", on.TrustedProxies, want)
	}

	bad := map[string]map[string]string{
		"umami url only":    {"UMAMI_URL": umamiURL},
		"umami id only":     {"UMAMI_WEBSITE_ID": umamiID},
		"bad trusted proxy": {"TRUSTED_PROXIES": "not-a-cidr"},
		"url bare host":     {"SITE_URL": "qarr.example.test"},
		"url with path":     {"SITE_URL": "https://qarr.example.test/app"},
		"url with query":    {"SITE_URL": "https://qarr.example.test?x=1"},
		"url with fragment": {"SITE_URL": "https://qarr.example.test#x"},
		"url with userinfo": {"SITE_URL": "https://user@qarr.example.test"},
		"url http remote":   {"SITE_URL": "http://qarr.example.test"},
		"url other scheme":  {"SITE_URL": "ftp://qarr.example.test"},
	}
	for name, values := range bad {
		_, err := config.Load(env(values))
		if err == nil {
			t.Errorf("%s: Load() = nil error, want one", name)
			continue
		}
		if strings.Contains(err.Error(), umamiURL) {
			t.Errorf("%s: error repeats the Umami URL: %v", name, err)
		}
		if strings.HasPrefix(name, "url") && !strings.Contains(err.Error(), "SITE_URL") {
			t.Errorf("%s: error does not name SITE_URL: %v", name, err)
		}
	}

	for _, ok := range []string{"http://localhost:8080", "https://qarr.example.test/"} {
		if _, err := config.Load(env(map[string]string{"SITE_URL": ok})); err != nil {
			t.Errorf("SITE_URL %q: Load() = %v, want none", ok, err)
		}
	}
}

// env builds a getenv function from a map, the shape config.Load expects.
func env(values map[string]string) func(string) string {
	return func(key string) string { return values[key] }
}

func TestLoad(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		values  map[string]string
		want    config.Config
		wantErr bool
	}{
		{
			name:   "defaults with nothing set",
			values: map[string]string{},
			want:   config.Config{Addr: ":8080", AdminAddr: ":8081", LogLevel: "info"},
		},
		{
			name: "every value set",
			values: map[string]string{
				"ADDR":       ":9090",
				"ADMIN_ADDR": ":9091",
				"LOG_LEVEL":  "debug",
			},
			want: config.Config{Addr: ":9090", AdminAddr: ":9091", LogLevel: "debug"},
		},
		{
			name:   "warn log level",
			values: map[string]string{"LOG_LEVEL": "warn"},
			want:   config.Config{Addr: ":8080", AdminAddr: ":8081", LogLevel: "warn"},
		},
		{
			name:   "error log level",
			values: map[string]string{"LOG_LEVEL": "error"},
			want:   config.Config{Addr: ":8080", AdminAddr: ":8081", LogLevel: "error"},
		},
		{
			name:    "invalid log level",
			values:  map[string]string{"LOG_LEVEL": "trace"},
			wantErr: true,
		},
		{
			name:    "empty log level string set explicitly still falls back to the default",
			values:  map[string]string{"LOG_LEVEL": ""},
			want:    config.Config{Addr: ":8080", AdminAddr: ":8081", LogLevel: "info"},
			wantErr: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := config.Load(env(tc.values))
			if tc.wantErr {
				if err == nil {
					t.Fatalf("Load() = %+v, want error", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("Load() returned unexpected error: %v", err)
			}
			// The Umami defaults (timeout, queue size) are govue's own and
			// are covered by TestLoad_Umami, not repeated in every row.
			got.Umami = tc.want.Umami
			got.SiteURL = tc.want.SiteURL // covered by TestLoad_Umami
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("Load() = %+v, want %+v", got, tc.want)
			}
		})
	}
}
