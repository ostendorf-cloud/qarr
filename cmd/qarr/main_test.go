// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"io/fs"
	"testing"
)

// TestEmbeddedDistBuildsAWorkingHandler proves the embedded dist filesystem
// is shaped the way main expects, without starting a server or binding a
// port: a build with an empty or mis-shaped frontend build fails here
// instead of at a request.
func TestEmbeddedDistBuildsAWorkingHandler(t *testing.T) {
	dist, err := fs.Sub(distFS, "dist")
	if err != nil {
		t.Fatalf("fs.Sub(distFS, \"dist\") error = %v", err)
	}

	if _, err := fs.Stat(dist, "index.html"); err != nil {
		t.Fatalf("embedded dist has no index.html: %v", err)
	}
}

func TestParseLevel(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		level   string
		wantErr bool
	}{
		{name: "debug", level: "debug"},
		{name: "info", level: "info"},
		{name: "warn", level: "warn"},
		{name: "error", level: "error"},
		{name: "unknown", level: "trace", wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			_, err := parseLevel(tc.level)
			if tc.wantErr && err == nil {
				t.Fatalf("parseLevel(%q) = nil error, want one", tc.level)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("parseLevel(%q) returned unexpected error: %v", tc.level, err)
			}
		})
	}
}
