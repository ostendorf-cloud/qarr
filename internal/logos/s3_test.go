// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package logos

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/ostendorf-cloud/qarr/internal/config"
)

const (
	fakeKeyID  = "AKIDEXAMPLE"
	fakeSecret = "not-a-real-secret-value"
	fakeBucket = "presets"
)

// fakeS3 is a path style S3 server holding objects in memory. It answers the
// two calls the client makes, ListObjectsV2 and GetObject, and refuses a
// request that is not signed with its key id.
type fakeS3 struct {
	objects  map[string]string // key to content
	pageSize int               // keys per listing page, 0 for all
	// basePath is a path the endpoint carries in front of the bucket.
	basePath string
	// alwaysTruncated makes every listing page claim another one follows.
	alwaysTruncated bool

	mu       sync.Mutex
	requests []string // "<method> <path>?<query>" of every request
}

func (f *fakeS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	f.requests = append(f.requests, r.Method+" "+r.URL.RequestURI())
	f.mu.Unlock()

	if !strings.HasPrefix(r.Header.Get("Authorization"), "AWS4-HMAC-SHA256 Credential="+fakeKeyID+"/") ||
		r.Header.Get("X-Amz-Date") == "" || r.Header.Get("X-Amz-Content-Sha256") == "" {
		writeS3Error(w, http.StatusForbidden, "AccessDenied")
		return
	}
	path := strings.TrimPrefix(r.URL.Path, f.basePath)
	switch {
	case path == "/"+fakeBucket:
		f.list(w, r)
	case strings.HasPrefix(path, "/"+fakeBucket+"/"):
		key := strings.TrimPrefix(path, "/"+fakeBucket+"/")
		content, ok := f.objects[key]
		if !ok {
			writeS3Error(w, http.StatusNotFound, "NoSuchKey")
			return
		}
		_, _ = io.WriteString(w, content)
	default:
		writeS3Error(w, http.StatusNotFound, "NoSuchBucket")
	}
}

func (f *fakeS3) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if q.Get("list-type") != "2" || q.Get("delimiter") != "/" {
		writeS3Error(w, http.StatusBadRequest, "InvalidArgument")
		return
	}
	prefix := q.Get("prefix")
	var keys []string
	for key := range f.objects {
		if strings.HasPrefix(key, prefix) && !strings.Contains(strings.TrimPrefix(key, prefix), "/") {
			keys = append(keys, key)
		}
	}
	// The delimiter hides every key below the prefix. A marker object of the
	// prefix itself ("brand/") is still a key and is listed.
	slices.Sort(keys)

	start := 0
	if token := q.Get("continuation-token"); token != "" {
		_, _ = fmt.Sscanf(token, "page-%d", &start)
	}
	end := len(keys)
	truncated := f.alwaysTruncated
	if f.pageSize > 0 && start+f.pageSize < end {
		end = start + f.pageSize
		truncated = true
	}
	if start > end {
		start = end
	}

	type contents struct {
		Key  string `xml:"Key"`
		Size int    `xml:"Size"`
	}
	var doc struct {
		XMLName               xml.Name   `xml:"ListBucketResult"`
		IsTruncated           bool       `xml:"IsTruncated"`
		NextContinuationToken string     `xml:"NextContinuationToken,omitempty"`
		Contents              []contents `xml:"Contents"`
	}
	doc.IsTruncated = truncated
	if truncated {
		doc.NextContinuationToken = fmt.Sprintf("page-%d", end)
	}
	for _, key := range keys[start:end] {
		doc.Contents = append(doc.Contents, contents{Key: key, Size: len(f.objects[key])})
	}
	w.Header().Set("Content-Type", "application/xml")
	_ = xml.NewEncoder(w).Encode(doc)
}

func writeS3Error(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/xml")
	w.WriteHeader(status)
	_, _ = fmt.Fprintf(w, "<Error><Code>%s</Code><Message>denied for key %s</Message></Error>", code, fakeSecret)
}

func (f *fakeS3) seen() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return slices.Clone(f.requests)
}

func newFakeS3(t *testing.T, f *fakeS3) config.S3 {
	t.Helper()
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	return config.S3{
		Endpoint:        srv.URL + f.basePath,
		Bucket:          fakeBucket,
		Region:          "us-east-1",
		AccessKeyID:     fakeKeyID,
		SecretAccessKey: fakeSecret,
	}
}

func names(entries []Entry) []string {
	var out []string
	for _, e := range entries {
		out = append(out, e.Name)
	}
	return out
}

func TestS3_List(t *testing.T) {
	t.Parallel()
	objects := map[string]string{
		"acme.svg":        "<svg/>",
		"zeta.png":        "png",
		"notes.txt":       "text",
		"brand/one.svg":   "<svg/>",
		"brand/two.svg":   "<svg/>",
		"brand/deep/x.sv": "x",
		"brand/":          "",
	}
	tests := []struct {
		name     string
		prefix   string
		pageSize int
		want     []string
		requests int
	}{
		{name: "the bucket root", want: []string{"acme.svg", "notes.txt", "zeta.png"}, requests: 1},
		{name: "a prefix", prefix: "brand", want: []string{"one.svg", "two.svg"}, requests: 1},
		{name: "a listing in pages", pageSize: 1, want: []string{"acme.svg", "notes.txt", "zeta.png"}, requests: 3},
		// The marker object "brand/" is a key of its own, so it takes a page.
		{name: "a prefix in pages", prefix: "brand", pageSize: 1, want: []string{"one.svg", "two.svg"}, requests: 3},
		{name: "a prefix without objects", prefix: "missing", want: nil, requests: 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			fake := &fakeS3{objects: objects, pageSize: tt.pageSize}
			cfg := newFakeS3(t, fake)
			cfg.Prefix = tt.prefix
			s, err := NewS3(cfg, nil)
			if err != nil {
				t.Fatal(err)
			}
			got, err := s.List(context.Background())
			if err != nil {
				t.Fatalf("List: %v", err)
			}
			if !slices.Equal(names(got), tt.want) {
				t.Errorf("List = %v, want %v", names(got), tt.want)
			}
			if n := len(fake.seen()); n != tt.requests {
				t.Errorf("requests = %d, want %d: %v", n, tt.requests, fake.seen())
			}
		})
	}
}

func TestS3_ListReportsSizes(t *testing.T) {
	t.Parallel()
	fake := &fakeS3{objects: map[string]string{"a.png": "12345"}}
	cfg := newFakeS3(t, fake)
	s, err := NewS3(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != (Entry{Name: "a.png", Size: 5}) {
		t.Errorf("List = %+v, want a.png of 5 bytes", got)
	}
}

func TestS3_ListStopsAtThePageLimit(t *testing.T) {
	t.Parallel()
	fake := &fakeS3{objects: map[string]string{"a.png": "x", "b.png": "x"}, pageSize: 1, alwaysTruncated: true}
	cfg := newFakeS3(t, fake)
	s, err := NewS3(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.List(context.Background()); err == nil {
		t.Fatal("a listing that never ends returned no error")
	}
	if n := len(fake.seen()); n != maxListPages {
		t.Errorf("requests = %d, want %d", n, maxListPages)
	}
}

func TestS3_Open(t *testing.T) {
	t.Parallel()
	objects := map[string]string{
		"acme.svg":       "<svg>root</svg>",
		"brand/acme.svg": "<svg>prefixed</svg>",
		"brand/a b.svg":  "<svg>space</svg>",
	}
	tests := []struct {
		name     string
		prefix   string
		basePath string
		logo     string
		want     string
		wantErr  error
	}{
		{name: "from the root", logo: "acme.svg", want: "<svg>root</svg>"},
		{name: "under a prefix", prefix: "brand", logo: "acme.svg", want: "<svg>prefixed</svg>"},
		{name: "an endpoint with a path", basePath: "/s3", logo: "acme.svg", want: "<svg>root</svg>"},
		{name: "a missing object", logo: "other.svg", wantErr: ErrNotFound},
		{name: "a name that is not valid", logo: "../acme.svg", wantErr: ErrNotFound},
		{name: "a name with a path", logo: "brand/acme.svg", wantErr: ErrNotFound},
		{name: "a name with a space", prefix: "brand", logo: "a b.svg", wantErr: ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			fake := &fakeS3{objects: objects, basePath: tt.basePath}
			cfg := newFakeS3(t, fake)
			cfg.Prefix = tt.prefix
			s, err := NewS3(cfg, nil)
			if err != nil {
				t.Fatal(err)
			}
			obj, err := s.Open(context.Background(), tt.logo)
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
			if string(body) != tt.want {
				t.Errorf("body = %q, want %q", body, tt.want)
			}
			if obj.Size != int64(len(tt.want)) {
				t.Errorf("Size = %d, want %d", obj.Size, len(tt.want))
			}
		})
	}
}

func TestS3_InvalidNameSendsNoRequest(t *testing.T) {
	t.Parallel()
	fake := &fakeS3{objects: map[string]string{}}
	cfg := newFakeS3(t, fake)
	s, err := NewS3(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Open(context.Background(), "../../etc/passwd"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Open error = %v, want ErrNotFound", err)
	}
	if got := fake.seen(); len(got) != 0 {
		t.Errorf("a request was sent: %v", got)
	}
}

func TestS3_ErrorReplies(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		keyID      string
		bucket     string
		call       func(*S3) error
		wantStatus int
		wantCode   string
	}{
		{
			name:  "the key is refused on a listing",
			keyID: "OTHERKEY",
			call: func(s *S3) error {
				_, err := s.List(context.Background())
				return err
			},
			wantStatus: http.StatusForbidden, wantCode: "AccessDenied",
		},
		{
			name:  "the key is refused on a get",
			keyID: "OTHERKEY",
			call: func(s *S3) error {
				_, err := s.Open(context.Background(), "a.png")
				return err
			},
			wantStatus: http.StatusForbidden, wantCode: "AccessDenied",
		},
		{
			name:   "the bucket does not exist",
			bucket: "gone",
			call: func(s *S3) error {
				_, err := s.List(context.Background())
				return err
			},
			wantStatus: http.StatusNotFound, wantCode: "NoSuchBucket",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			cfg := newFakeS3(t, &fakeS3{objects: map[string]string{"a.png": "x"}})
			if tt.keyID != "" {
				cfg.AccessKeyID = tt.keyID
			}
			if tt.bucket != "" {
				cfg.Bucket = tt.bucket
			}
			s, err := NewS3(cfg, nil)
			if err != nil {
				t.Fatal(err)
			}
			err = tt.call(s)
			var se *StatusError
			if !errors.As(err, &se) {
				t.Fatalf("error = %v, want a *StatusError", err)
			}
			if se.Status != tt.wantStatus || se.Code != tt.wantCode {
				t.Errorf("StatusError = %d %q, want %d %q", se.Status, se.Code, tt.wantStatus, tt.wantCode)
			}
			if strings.Contains(err.Error(), fakeSecret) {
				t.Errorf("the error carries the secret: %v", err)
			}
		})
	}
}

func TestS3_DoesNotFollowARedirect(t *testing.T) {
	t.Parallel()
	var elsewhereHits int
	elsewhere := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { elsewhereHits++ }))
	t.Cleanup(elsewhere.Close)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, elsewhere.URL+"/x", http.StatusMovedPermanently)
	}))
	t.Cleanup(srv.Close)

	s, err := NewS3(config.S3{Endpoint: srv.URL, Bucket: fakeBucket, Region: "us-east-1", AccessKeyID: fakeKeyID, SecretAccessKey: fakeSecret}, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.List(context.Background())
	var se *StatusError
	if !errors.As(err, &se) || se.Status != http.StatusMovedPermanently {
		t.Fatalf("error = %v, want a 301 *StatusError", err)
	}
	if elsewhereHits != 0 {
		t.Errorf("the redirect target was called %d times", elsewhereHits)
	}
}

func TestS3_UnreachableAndCancelled(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.NotFoundHandler())
	cfg := config.S3{Endpoint: srv.URL, Bucket: fakeBucket, Region: "us-east-1", AccessKeyID: fakeKeyID, SecretAccessKey: fakeSecret}
	srv.Close()
	s, err := NewS3(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}

	t.Run("the server is down", func(t *testing.T) {
		t.Parallel()
		_, err := s.List(context.Background())
		var ue *url.Error
		if !errors.As(err, &ue) {
			t.Fatalf("error = %v, want a *url.Error", err)
		}
		if strings.Contains(err.Error(), fakeSecret) {
			t.Errorf("the error carries the secret: %v", err)
		}
	})
	t.Run("the context is cancelled", func(t *testing.T) {
		t.Parallel()
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		if _, err := s.List(ctx); !errors.Is(err, context.Canceled) {
			t.Fatalf("error = %v, want context.Canceled", err)
		}
	})
}

func TestS3_SignsEveryRequest(t *testing.T) {
	t.Parallel()
	fake := &fakeS3{objects: map[string]string{"a.png": "x"}}
	cfg := newFakeS3(t, fake)
	s, err := NewS3(cfg, nil)
	if err != nil {
		t.Fatal(err)
	}
	// The fake answers 403 to anything not signed with the key id, so a
	// successful call proves the Authorization header was sent.
	if _, err := s.List(context.Background()); err != nil {
		t.Fatalf("List: %v", err)
	}
	obj, err := s.Open(context.Background(), "a.png")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	_ = obj.Body.Close() // the test reads nothing
}

func TestNewS3_RejectsABadEndpoint(t *testing.T) {
	t.Parallel()
	for _, endpoint := range []string{"", "s3.example.org", "ftp://s3.example.org", "https://"} {
		t.Run(endpoint, func(t *testing.T) {
			t.Parallel()
			if _, err := NewS3(config.S3{Endpoint: endpoint, Bucket: "b"}, nil); err == nil {
				t.Errorf("NewS3(%q) returned no error", endpoint)
			}
		})
	}
}

func TestStatusError_Message(t *testing.T) {
	t.Parallel()
	tests := []struct {
		err  StatusError
		want string
	}{
		{StatusError{Op: "list", Status: 403, Code: "AccessDenied"}, "bucket list answered 403 AccessDenied"},
		{StatusError{Op: "get", Status: 500}, "bucket get answered 500"},
	}
	for _, tt := range tests {
		if got := tt.err.Error(); got != tt.want {
			t.Errorf("Error() = %q, want %q", got, tt.want)
		}
	}
}

func TestErrorCode(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		body string
		want string
	}{
		{"a code", "<Error><Code>NoSuchKey</Code></Error>", "NoSuchKey"},
		{"no code", "<Error></Error>", ""},
		{"not xml", "forbidden", ""},
		{"a code with markup characters", "<Error><Code>a b&lt;c</Code></Error>", ""},
		{"a code that is too long", "<Error><Code>" + strings.Repeat("a", 65) + "</Code></Error>", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := errorCode(strings.NewReader(tt.body)); got != tt.want {
				t.Errorf("errorCode = %q, want %q", got, tt.want)
			}
		})
	}
}
