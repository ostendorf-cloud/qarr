// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package config_test

import (
	"testing"

	"github.com/ostendorf-cloud/qarr/internal/config"
)

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
			if got != tc.want {
				t.Fatalf("Load() = %+v, want %+v", got, tc.want)
			}
		})
	}
}
