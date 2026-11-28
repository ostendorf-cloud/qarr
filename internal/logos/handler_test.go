// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package logos

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

// fakeSource is a Source with canned content.
type fakeSource struct {
	entries []Entry
	files   map[string]string
	// size overrides the size Open reports, -1 for unknown, 0 for the
	// length of the content.
	size    int64
	listErr error
	openErr error
	// body, when set, replaces the content as the body Open returns.
	body func() io.Reader

	// hold, when set, holds the List call numbered holdCall (1 is the first)
	// until hold is closed. Every other call returns at once, so a call that
	// should have waited shows up in listCalls instead of hanging the test.
	hold     chan struct{}
	holdCall int

	mu        sync.Mutex
	opened    []string
	listCalls int
}

// List returns entries, or one entry per file when entries is nil.
func (f *fakeSource) List(ctx context.Context) ([]Entry, error) {
	f.mu.Lock()
	f.listCalls++
	held := f.hold != nil && f.listCalls == f.holdCall
	entries, err := f.entries, f.listErr
	if entries == nil {
		for name, content := range f.files {
			entries = append(entries, Entry{Name: name, Size: int64(len(content))})
		}
	}
	f.mu.Unlock()
	if held {
		select {
		case <-f.hold:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return entries, err
}

// set replaces what List returns.
func (f *fakeSource) set(entries []Entry, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.entries, f.listErr = entries, err
}

func (f *fakeSource) calls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.listCalls
}

func (f *fakeSource) Open(_ context.Context, name string) (*Object, error) {
	f.mu.Lock()
	f.opened = append(f.opened, name)
	f.mu.Unlock()
	if f.openErr != nil {
		return nil, f.openErr
	}
	content, ok := f.files[name]
	if !ok {
		return nil, ErrNotFound
	}
	size := int64(len(content))
	if f.size != 0 {
		size = f.size
	}
	var body io.Reader = strings.NewReader(content)
	if f.body != nil {
		body = f.body()
	}
	return &Object{Body: io.NopCloser(body), Size: size}, nil
}

func serve(t *testing.T, src Source, method, target string) (*httptest.ResponseRecorder, *bytes.Buffer) {
	t.Helper()
	var logs bytes.Buffer
	mux := http.NewServeMux()
	Register(mux, src, slog.New(slog.NewTextHandler(&logs, nil)))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), method, target, nil))
	return rec, &logs
}

func TestHandler_List(t *testing.T) {
	t.Parallel()
	src := &fakeSource{entries: []Entry{
		{Name: "acme.svg", Size: 100},
		{Name: "notes.txt", Size: 10},
		{Name: ".hidden.png", Size: 10},
		{Name: "huge.png", Size: MaxBytes + 1},
		{Name: "edge.png", Size: MaxBytes},
		{Name: "a b.png", Size: 10},
	}}
	rec, _ := serve(t, src, http.MethodGet, ListPath)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "application/json") {
		t.Errorf("Content-Type = %q, want JSON", got)
	}
	var body listing
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body is not the listing: %v", err)
	}
	want := []listed{
		{Name: "acme.svg", URL: "/logos/acme.svg"},
		{Name: "edge.png", URL: "/logos/edge.png"},
	}
	if len(body.Logos) != len(want) {
		t.Fatalf("logos = %+v, want %+v", body.Logos, want)
	}
	for i := range want {
		if body.Logos[i] != want[i] {
			t.Errorf("logos[%d] = %+v, want %+v", i, body.Logos[i], want[i])
		}
	}
}

func TestHandler_ListWithoutASource(t *testing.T) {
	t.Parallel()
	rec, _ := serve(t, Empty{}, http.MethodGet, ListPath)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	// An empty list is [], never null: the page iterates over it.
	if got := strings.TrimSpace(rec.Body.String()); got != `{"logos":[]}` {
		t.Errorf("body = %s, want {\"logos\":[]}", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
}

func TestHandler_ListSourceError(t *testing.T) {
	t.Parallel()
	rec, logs := serve(t, &fakeSource{listErr: errors.New("bucket list answered 403 AccessDenied")}, http.MethodGet, ListPath)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
	if strings.Contains(rec.Body.String(), "403") {
		t.Errorf("the reply leaks the source error: %q", rec.Body.String())
	}
	if !strings.Contains(logs.String(), "AccessDenied") {
		t.Errorf("the error was not logged: %q", logs.String())
	}
}

func TestHandler_Picture(t *testing.T) {
	t.Parallel()
	src := &fakeSource{files: map[string]string{
		"acme.svg": "<svg/>",
		"a.PNG":    "png",
		"p.jpeg":   "jpeg",
		"p.jpg":    "jpg",
	}}
	tests := []struct {
		name     string
		method   string
		path     string
		wantType string
		wantBody string
	}{
		{"svg", http.MethodGet, "/logos/acme.svg", "image/svg+xml", "<svg/>"},
		{"png with an upper case extension", http.MethodGet, "/logos/a.PNG", "image/png", "png"},
		{"jpeg", http.MethodGet, "/logos/p.jpeg", "image/jpeg", "jpeg"},
		{"jpg", http.MethodGet, "/logos/p.jpg", "image/jpeg", "jpg"},
		{"head has the headers and no body", http.MethodHead, "/logos/acme.svg", "image/svg+xml", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			rec, _ := serve(t, src, tt.method, tt.path)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", rec.Code)
			}
			h := rec.Header()
			if got := h.Get("Content-Type"); got != tt.wantType {
				t.Errorf("Content-Type = %q, want %q", got, tt.wantType)
			}
			if got := h.Get("Cache-Control"); got != "public, max-age=3600" {
				t.Errorf("Cache-Control = %q, want a cache lifetime", got)
			}
			if got := h.Get("X-Content-Type-Options"); got != "nosniff" {
				t.Errorf("X-Content-Type-Options = %q, want nosniff", got)
			}
			if got := h.Get("Content-Security-Policy"); !strings.Contains(got, "sandbox") || !strings.Contains(got, "default-src 'none'") {
				t.Errorf("Content-Security-Policy = %q, want a restrictive policy", got)
			}
			if got := h.Get("Location"); got != "" {
				t.Errorf("Location = %q: a picture is never a redirect", got)
			}
			if got := rec.Body.String(); got != tt.wantBody {
				t.Errorf("body = %q, want %q", got, tt.wantBody)
			}
		})
	}
}

func TestHandler_PictureLength(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		size       int64
		wantStatus int
		wantLength string
		wantBody   string
	}{
		{"the reported size", 0, http.StatusOK, "6", "<svg/>"},
		{"an unknown size is measured by reading it", -1, http.StatusOK, "6", "<svg/>"},
		{"a size over the limit", MaxBytes + 1, http.StatusNotFound, "", "404 page not found\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			src := &fakeSource{files: map[string]string{"a.svg": "<svg/>"}, size: tt.size}
			rec, _ := serve(t, src, http.MethodGet, "/logos/a.svg")
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			if got := rec.Header().Get("Content-Length"); got != tt.wantLength {
				t.Errorf("Content-Length = %q, want %q", got, tt.wantLength)
			}
			if got := rec.Body.String(); got != tt.wantBody {
				t.Errorf("body = %q, want %q", got, tt.wantBody)
			}
		})
	}
}

func TestHandler_PictureOverTheLimitWithoutASize(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		method     string
		length     int
		wantStatus int
	}{
		{"one byte over", http.MethodGet, MaxBytes + 1, http.StatusNotFound},
		{"far over", http.MethodGet, MaxBytes + 10, http.StatusNotFound},
		{"head over", http.MethodHead, MaxBytes + 1, http.StatusNotFound},
		{"exactly the limit", http.MethodGet, MaxBytes, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			src := &fakeSource{files: map[string]string{"a.png": strings.Repeat("x", tt.length)}, size: -1}
			rec, _ := serve(t, src, tt.method, "/logos/a.png")
			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tt.wantStatus)
			}
			cc := rec.Header().Get("Cache-Control")
			if tt.wantStatus == http.StatusNotFound {
				// A picture that is cut off must never be kept by a cache.
				if strings.Contains(cc, "max-age") {
					t.Errorf("Cache-Control = %q: a refusal must not be cached", cc)
				}
				if rec.Body.Len() >= MaxBytes {
					t.Errorf("body = %d bytes, want the 404 text", rec.Body.Len())
				}
				return
			}
			if rec.Body.Len() != MaxBytes {
				t.Errorf("body = %d bytes, want %d", rec.Body.Len(), MaxBytes)
			}
		})
	}
}

func TestHandler_PictureReadErrorWithoutASize(t *testing.T) {
	t.Parallel()
	src := &fakeSource{
		files: map[string]string{"a.png": "x"},
		size:  -1,
		body:  func() io.Reader { return io.MultiReader(strings.NewReader("x"), errReader{}) },
	}
	rec, _ := serve(t, src, http.MethodGet, "/logos/a.png")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
}

type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, errors.New("connection reset") }

func TestHandler_PictureNotServed(t *testing.T) {
	t.Parallel()
	src := &fakeSource{files: map[string]string{"notes.txt": "text", ".env.png": "x"}}
	tests := []struct {
		name string
		path string
	}{
		{"a missing picture", "/logos/none.png"},
		{"an extension that is not a picture", "/logos/notes.txt"},
		{"a name without an extension", "/logos/acme"},
		{"a hidden file", "/logos/.env.png"},
		{"an encoded path", "/logos/..%2Fsecret.png"},
		{"a nested path", "/logos/sub/a.png"},
		{"the directory itself", "/logos/"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			rec, _ := serve(t, src, http.MethodGet, tt.path)
			if rec.Code != http.StatusNotFound {
				t.Errorf("status = %d, want 404", rec.Code)
			}
			if got := rec.Header().Get("Cache-Control"); strings.Contains(got, "max-age") {
				t.Errorf("Cache-Control = %q: a miss must not be cached", got)
			}
		})
	}
	if len(src.opened) != 0 {
		t.Errorf("the source was asked for %v, want nothing", src.opened)
	}
}

func TestHandler_PictureSourceError(t *testing.T) {
	t.Parallel()
	src := &fakeSource{
		entries: []Entry{{Name: "a.png", Size: 1}},
		openErr: &StatusError{Op: "get", Status: 500},
	}
	rec, logs := serve(t, src, http.MethodGet, "/logos/a.png")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
	if !strings.Contains(logs.String(), "bucket get answered 500") {
		t.Errorf("the error was not logged: %q", logs.String())
	}
}

func TestHandler_OtherMethods(t *testing.T) {
	t.Parallel()
	src := &fakeSource{files: map[string]string{"a.png": "x"}}
	for _, target := range []string{ListPath, "/logos/a.png"} {
		rec, _ := serve(t, src, http.MethodPost, target)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("POST %s status = %d, want 405", target, rec.Code)
		}
	}
}
