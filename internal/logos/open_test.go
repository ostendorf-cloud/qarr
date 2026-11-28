// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package logos

import (
	"bytes"
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ostendorf-cloud/qarr/internal/config"
)

func discardLogger(buf *bytes.Buffer) *slog.Logger {
	return slog.New(slog.NewTextHandler(buf, nil))
}

func TestOpen_NoSource(t *testing.T) {
	t.Parallel()
	var logs bytes.Buffer
	src, err := Open(context.Background(), config.Logos{}, discardLogger(&logs))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if _, ok := src.(Empty); !ok {
		t.Errorf("source = %T, want Empty", src)
	}
	// Said once, in one line, and not as a warning or an error: a deployment
	// without presets is a working one.
	if n := strings.Count(logs.String(), "\n"); n != 1 {
		t.Errorf("log lines = %d, want 1: %q", n, logs.String())
	}
	if !strings.Contains(logs.String(), "level=INFO") || !strings.Contains(logs.String(), "upload only") {
		t.Errorf("log = %q, want an info line saying upload only", logs.String())
	}
	entries, err := src.List(context.Background())
	if err != nil || len(entries) != 0 {
		t.Errorf("List = %v, %v, want nothing", entries, err)
	}
	if _, err := src.Open(context.Background(), "a.png"); !errors.Is(err, ErrNotFound) {
		t.Errorf("Open error = %v, want ErrNotFound", err)
	}
}

func TestOpen_Directory(t *testing.T) {
	t.Parallel()
	var logs bytes.Buffer
	src, err := Open(context.Background(), config.Logos{Dir: logoDir(t)}, discardLogger(&logs))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if _, ok := src.(*Dir); !ok {
		t.Errorf("source = %T, want *Dir", src)
	}
	// Three pictures are served: acme.svg, alias.svg, zeta.png.
	if !strings.Contains(logs.String(), "count=3") {
		t.Errorf("log = %q, want the count of served pictures", logs.String())
	}
}

func TestOpen_UnreadableDirectory(t *testing.T) {
	t.Parallel()
	missing := filepath.Join(t.TempDir(), "missing")
	var logs bytes.Buffer
	src, err := Open(context.Background(), config.Logos{Dir: missing}, discardLogger(&logs))
	if err == nil {
		t.Fatalf("Open returned %T and no error", src)
	}
	if !errors.Is(err, fs.ErrNotExist) {
		t.Errorf("error = %v, want fs.ErrNotExist", err)
	}
	if !strings.Contains(err.Error(), missing) {
		t.Errorf("error = %q, want it to name the directory", err)
	}
	// The caller reports the error, so Open logs nothing itself.
	if logs.Len() != 0 {
		t.Errorf("log = %q, want nothing", logs.String())
	}
}

func TestOpen_Bucket(t *testing.T) {
	t.Parallel()
	var logs bytes.Buffer
	fake := &fakeS3{objects: map[string]string{"a.png": "x", "b.svg": "<svg/>", "c.txt": "t"}}
	s3cfg := newFakeS3(t, fake)
	src, err := Open(context.Background(), config.Logos{S3: s3cfg}, discardLogger(&logs))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if _, ok := src.(*S3); !ok {
		t.Errorf("source = %T, want *S3", src)
	}
	if !strings.Contains(logs.String(), "count=2") {
		t.Errorf("log = %q, want the count of served pictures", logs.String())
	}
	if strings.Contains(logs.String(), fakeSecret) || strings.Contains(logs.String(), fakeKeyID) {
		t.Errorf("log carries a credential: %q", logs.String())
	}
}

func TestOpen_UnreadableBucket(t *testing.T) {
	t.Parallel()
	down := httptest.NewServer(http.NotFoundHandler())
	downCfg := config.S3{Endpoint: down.URL, Bucket: fakeBucket, Region: "us-east-1", AccessKeyID: fakeKeyID, SecretAccessKey: fakeSecret}
	down.Close()

	refused := newFakeS3(t, &fakeS3{})
	refused.AccessKeyID = "OTHERKEY"

	noBucket := newFakeS3(t, &fakeS3{})
	noBucket.Bucket = "gone"

	tests := []struct {
		name    string
		cfg     config.S3
		wantErr func(error) bool
	}{
		{"the key is refused", refused, func(err error) bool {
			var se *StatusError
			return errors.As(err, &se) && se.Status == http.StatusForbidden && se.Code == "AccessDenied"
		}},
		{"the bucket does not exist", noBucket, func(err error) bool {
			var se *StatusError
			return errors.As(err, &se) && se.Status == http.StatusNotFound
		}},
		{"the server is down", downCfg, func(err error) bool { return err != nil }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			var logs bytes.Buffer
			src, err := Open(context.Background(), config.Logos{S3: tt.cfg}, discardLogger(&logs))
			if err == nil {
				t.Fatalf("Open returned %T and no error", src)
			}
			if !tt.wantErr(err) {
				t.Errorf("error = %v", err)
			}
			for _, secret := range []string{fakeSecret, fakeKeyID, "OTHERKEY"} {
				if strings.Contains(err.Error(), secret) {
					t.Errorf("the error carries %q: %v", secret, err)
				}
			}
			if !strings.Contains(err.Error(), "preset logos") || !strings.Contains(err.Error(), "bucket "+tt.cfg.Bucket) {
				t.Errorf("error = %q, want it to name the preset logos and the bucket", err)
			}
		})
	}
}

func TestOpen_BadEndpoint(t *testing.T) {
	t.Parallel()
	var logs bytes.Buffer
	_, err := Open(context.Background(), config.Logos{S3: config.S3{Endpoint: "not a url", Bucket: "b"}}, discardLogger(&logs))
	if err == nil {
		t.Fatal("Open returned no error")
	}
}

func TestOpen_CancelledContext(t *testing.T) {
	t.Parallel()
	s3cfg := newFakeS3(t, &fakeS3{objects: map[string]string{"a.png": "x"}})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	var logs bytes.Buffer
	if _, err := Open(ctx, config.Logos{S3: s3cfg}, discardLogger(&logs)); !errors.Is(err, context.Canceled) {
		t.Errorf("error = %v, want context.Canceled", err)
	}
}

func TestValid(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		in   string
		want bool
	}{
		{"svg", "acme.svg", true},
		{"png in capitals", "ACME.PNG", true},
		{"jpg", "a-b_c.1.jpg", true},
		{"jpeg", "a.jpeg", true},
		{"empty", "", false},
		{"an extension only", ".png", false},
		{"no extension", "acme", false},
		{"a gif", "a.gif", false},
		{"a double extension that ends in text", "a.png.txt", false},
		{"a slash", "a/b.png", false},
		{"a backslash", `a\b.png`, false},
		{"a parent", "../a.png", false},
		{"a space", "a b.png", false},
		{"a percent sign", "a%2e.png", false},
		{"a non ASCII letter", "ä.png", false},
		{"a newline", "a\n.png", false},
		{"the longest name", strings.Repeat("a", maxNameLen-4) + ".png", true},
		{"one over the longest name", strings.Repeat("a", maxNameLen-3) + ".png", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := Valid(tt.in); got != tt.want {
				t.Errorf("Valid(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}
