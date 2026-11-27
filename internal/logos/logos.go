// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

// Package logos lists the preset logos a deployment offers and serves them
// under qarr's own origin. The pictures are not part of this repository: they
// come from a bucket or a directory the deployment points at, see
// docs/adr/0003-preset-logos-come-from-a-bucket-and-qarr-serves-them.md.
//
// Serving them from this origin, never by a redirect, keeps the canvas that
// draws them untainted, which is what lets the page read the drawing back to
// export it and to check that it still scans.
package logos

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/ostendorf-cloud/qarr/internal/config"
)

// MaxBytes is the largest picture served, the same limit the page puts on a
// logo a visitor uploads (web/src/qr/logo.ts MAX_LOGO_BYTES).
const MaxBytes = 2 * 1024 * 1024

// startupTimeout bounds the read that proves a configured source works.
const startupTimeout = 15 * time.Second

// ErrNotFound is returned by Source.Open for a name the source does not hold.
var ErrNotFound = errors.New("logo not found")

// Entry is one picture a source holds.
type Entry struct {
	// Name is the file name, such as "acme.svg". It is what the page asks for.
	Name string
	// Size is the size of the picture in bytes.
	Size int64
}

// Object is one opened picture.
type Object struct {
	// Body is the picture. The caller closes it.
	Body io.ReadCloser
	// Size is the size in bytes the source reports, or -1 when it does not.
	Size int64
}

// Source is where the pictures live. A source returns every file it holds:
// which of them are served is decided by Valid, not by the source.
type Source interface {
	// List returns the pictures at the top level of the source.
	List(ctx context.Context) ([]Entry, error)
	// Open returns the picture called name, or ErrNotFound.
	Open(ctx context.Context, name string) (*Object, error)
}

// types maps a lower case file extension onto the type the picture is served
// as. The three kinds are the ones the page accepts as a logo
// (web/src/qr/logo.ts LOGO_TYPES).
var types = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".svg":  "image/svg+xml",
}

// maxNameLen bounds a file name.
const maxNameLen = 128

// Valid reports whether name is a file name this package serves: plain
// characters only, no path, no leading dot and one of the known extensions.
// A name that fails is never passed to a source.
func Valid(name string) bool {
	if name == "" || len(name) > maxNameLen || name[0] == '.' {
		return false
	}
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case r == '.', r == '-', r == '_':
		default:
			return false
		}
	}
	_, ok := types[strings.ToLower(path.Ext(name))]
	return ok
}

// ContentType is the type a valid name is served as.
func ContentType(name string) string {
	return types[strings.ToLower(path.Ext(name))]
}

// Empty is the source of a deployment with no preset logos configured.
type Empty struct{}

// List returns no pictures.
func (Empty) List(context.Context) ([]Entry, error) { return nil, nil }

// Open finds nothing.
func (Empty) Open(context.Context, string) (*Object, error) { return nil, ErrNotFound }

// Open builds the source a configuration names and proves it can be read.
//
// With no source configured it says once that the page offers upload only and
// returns an empty source: that is a working service. A source that is
// configured but cannot be read is an error, which stops the server at
// startup with one message. Readiness never checks the source afterwards: the
// presets are a soft dependency, upload works without them.
func Open(ctx context.Context, cfg config.Logos, logger *slog.Logger) (Source, error) {
	var (
		src   Source
		where string
		err   error
	)
	switch {
	case cfg.S3.Bucket != "":
		where = "bucket " + cfg.S3.Bucket + " at " + hostOf(cfg.S3.Endpoint)
		src, err = NewS3(cfg.S3, nil)
	case cfg.Dir != "":
		where = "directory " + cfg.Dir
		src, err = NewDir(cfg.Dir)
	default:
		logger.Info("no preset logo source is configured: the page offers upload only")
		return Empty{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("preset logos: %s: %w", where, err)
	}

	ctx, cancel := context.WithTimeout(ctx, startupTimeout)
	defer cancel()
	entries, err := src.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("preset logos: %s is not readable: %w", where, err)
	}
	logger.Info("preset logos are served", "source", where, "count", len(Served(entries)))
	return src, nil
}

// Served keeps the entries that are served: a valid name and a size within
// MaxBytes. The order of the source is kept.
func Served(entries []Entry) []Entry {
	var out []Entry
	for _, e := range entries {
		if Valid(e.Name) && e.Size <= MaxBytes {
			out = append(out, e)
		}
	}
	return out
}

// hostOf is the host of an endpoint URL, for a message that must not carry
// anything else the URL holds.
func hostOf(endpoint string) string {
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return "the configured endpoint"
	}
	return u.Host
}
