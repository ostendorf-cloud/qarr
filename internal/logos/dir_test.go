// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package logos

import (
	"context"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

// logoDir makes a directory with a few pictures, a subdirectory and a
// symbolic link that leaves the directory, and returns its path.
func logoDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	outside := t.TempDir()
	write := func(path, content string) {
		t.Helper()
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write(filepath.Join(dir, "acme.svg"), "<svg>acme</svg>")
	write(filepath.Join(dir, "zeta.png"), "png")
	write(filepath.Join(dir, "notes.txt"), "text")
	write(filepath.Join(outside, "secret.png"), "outside")
	if err := os.Mkdir(filepath.Join(dir, "sub"), 0o700); err != nil {
		t.Fatal(err)
	}
	write(filepath.Join(dir, "sub", "deep.png"), "deep")
	if err := os.Symlink(filepath.Join(outside, "secret.png"), filepath.Join(dir, "escape.png")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("acme.svg", filepath.Join(dir, "alias.svg")); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestDir_List(t *testing.T) {
	t.Parallel()
	d, err := NewDir(logoDir(t))
	if err != nil {
		t.Fatal(err)
	}
	got, err := d.List(context.Background())
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	// The subdirectory and the link that leaves the directory are not
	// listed, a link that stays inside is.
	want := []string{"acme.svg", "alias.svg", "notes.txt", "zeta.png"}
	if !slices.Equal(names(got), want) {
		t.Errorf("List = %v, want %v", names(got), want)
	}
	for _, e := range got {
		if e.Name == "zeta.png" && e.Size != 3 {
			t.Errorf("zeta.png Size = %d, want 3", e.Size)
		}
	}
}

func TestDir_Open(t *testing.T) {
	t.Parallel()
	d, err := NewDir(logoDir(t))
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name    string
		logo    string
		want    string
		wantErr error
	}{
		{name: "a picture", logo: "acme.svg", want: "<svg>acme</svg>"},
		{name: "a link inside the directory", logo: "alias.svg", want: "<svg>acme</svg>"},
		{name: "a missing file", logo: "none.png", wantErr: ErrNotFound},
		{name: "a link out of the directory", logo: "escape.png", wantErr: ErrNotFound},
		{name: "a parent path", logo: "../acme.svg", wantErr: ErrNotFound},
		{name: "a nested path", logo: "sub/deep.png", wantErr: ErrNotFound},
		{name: "a directory", logo: "sub", wantErr: ErrNotFound},
		{name: "an absolute path", logo: "/etc/passwd", wantErr: ErrNotFound},
		{name: "an empty name", logo: "", wantErr: ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			obj, err := d.Open(context.Background(), tt.logo)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("Open error = %v, want %v", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("Open: %v", err)
			}
			defer func() { _ = obj.Body.Close() }()
			body, err := io.ReadAll(obj.Body)
			if err != nil {
				t.Fatal(err)
			}
			if string(body) != tt.want || obj.Size != int64(len(tt.want)) {
				t.Errorf("got %q (%d bytes), want %q", body, obj.Size, tt.want)
			}
		})
	}
}

func TestDir_CancelledContext(t *testing.T) {
	t.Parallel()
	d, err := NewDir(logoDir(t))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := d.List(ctx); !errors.Is(err, context.Canceled) {
		t.Errorf("List error = %v, want context.Canceled", err)
	}
	if _, err := d.Open(ctx, "acme.svg"); !errors.Is(err, context.Canceled) {
		t.Errorf("Open error = %v, want context.Canceled", err)
	}
}

func TestNewDir(t *testing.T) {
	t.Parallel()
	file := filepath.Join(t.TempDir(), "plain")
	if err := os.WriteFile(file, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		path string
	}{
		{"a missing directory", filepath.Join(t.TempDir(), "missing")},
		{"a file", file},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			d, err := NewDir(tt.path)
			if err == nil {
				// os.OpenRoot accepts a file on some systems: the first read
				// is what fails then, and startup does that read.
				if _, err = d.List(context.Background()); err == nil {
					t.Fatal("neither NewDir nor List failed")
				}
			}
			if tt.name == "a missing directory" && !errors.Is(err, fs.ErrNotExist) {
				t.Errorf("error = %v, want fs.ErrNotExist", err)
			}
		})
	}
}
