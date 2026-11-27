// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package logos

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"slices"
	"strings"
)

// Dir is a source backed by a local directory, such as a mounted volume. It
// reads through os.Root, so a name or a symbolic link can never reach a file
// outside the directory.
type Dir struct {
	root *os.Root
}

// NewDir opens the directory. It fails when the path is missing, is not a
// directory or cannot be opened.
func NewDir(dir string) (*Dir, error) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, fmt.Errorf("open directory: %w", err)
	}
	return &Dir{root: root}, nil
}

// List returns the regular files at the top level of the directory.
func (d *Dir) List(ctx context.Context) ([]Entry, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	dirEntries, err := fs.ReadDir(d.root.FS(), ".")
	if err != nil {
		return nil, fmt.Errorf("read directory: %w", err)
	}
	var out []Entry
	for _, de := range dirEntries {
		// Stat follows a link inside the directory, which is how a mounted
		// ConfigMap or Secret lays its files out.
		info, err := d.root.Stat(de.Name())
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		out = append(out, Entry{Name: de.Name(), Size: info.Size()})
	}
	slices.SortFunc(out, func(a, b Entry) int { return strings.Compare(a.Name, b.Name) })
	return out, nil
}

// Open returns the file called name.
func (d *Dir) Open(ctx context.Context, name string) (*Object, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if !fs.ValidPath(name) || strings.Contains(name, "/") {
		return nil, ErrNotFound
	}
	// The same test as List: what the listing leaves out is not found here.
	// That covers a link that leaves the directory, which os.Root refuses.
	if _, err := d.root.Stat(name); err != nil && !errors.Is(err, fs.ErrPermission) {
		return nil, ErrNotFound
	}
	f, err := d.root.Open(name)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", name, err)
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close() // the stat error is the one worth reporting
		return nil, fmt.Errorf("stat %s: %w", name, err)
	}
	if !info.Mode().IsRegular() {
		_ = f.Close() // not a picture, nothing was read
		return nil, ErrNotFound
	}
	return &Object{Body: f, Size: info.Size()}, nil
}
