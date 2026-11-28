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
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/ostendorf-cloud/qarr/internal/config"
)

const (
	// s3Service is the service name in the signing scope.
	s3Service = "s3"
	// maxListPages bounds a listing, so a server that never stops saying
	// "truncated" cannot keep a request alive forever.
	maxListPages = 20
	// maxListBytes bounds one page of the listing document.
	maxListBytes = 4 << 20
	// requestTimeout is the lifetime of the default HTTP client's requests,
	// reading the body included.
	requestTimeout = 30 * time.Second
)

// StatusError is a reply from the bucket that is neither a picture nor a
// missing one. It carries the HTTP status and the S3 error code, never the
// body: a body can echo request details.
type StatusError struct {
	// Op is "list" or "get".
	Op string
	// Status is the HTTP status code.
	Status int
	// Code is the S3 error code from the reply, such as "AccessDenied". It is
	// empty when the reply carried none.
	Code string
}

func (e *StatusError) Error() string {
	msg := "bucket " + e.Op + " answered " + strconv.Itoa(e.Status)
	if e.Code != "" {
		msg += " " + e.Code
	}
	return msg
}

// S3 is a source backed by an S3 compatible bucket, read with a read only key.
// Requests use the path style, "<endpoint>/<bucket>/<key>", which every S3
// compatible server accepts. Only the keys directly under the prefix are
// pictures.
type S3 struct {
	base   *url.URL
	bucket string
	prefix string // without slashes at either end, empty for the bucket root
	region string
	creds  credentials
	client *http.Client
	now    func() time.Time
}

// NewS3 builds a client for the bucket. A nil client gets one with a timeout
// that never follows a redirect: a redirect would send the signed request
// somewhere the operator did not name.
func NewS3(cfg config.S3, client *http.Client) (*S3, error) {
	base, err := url.Parse(cfg.Endpoint)
	if err != nil || base.Host == "" || (base.Scheme != "http" && base.Scheme != "https") {
		return nil, errors.New("the endpoint is not an http or https URL")
	}
	if client == nil {
		client = &http.Client{
			Timeout: requestTimeout,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	return &S3{
		base:   base,
		bucket: cfg.Bucket,
		prefix: strings.Trim(cfg.Prefix, "/"),
		region: cfg.Region,
		creds:  credentials{accessKeyID: cfg.AccessKeyID, secretAccessKey: cfg.SecretAccessKey},
		client: client,
		now:    time.Now,
	}, nil
}

// listResult is the part of a ListObjectsV2 reply this client reads.
type listResult struct {
	IsTruncated           bool   `xml:"IsTruncated"`
	NextContinuationToken string `xml:"NextContinuationToken"`
	Contents              []struct {
		Key  string `xml:"Key"`
		Size int64  `xml:"Size"`
	} `xml:"Contents"`
}

// List returns the keys directly under the prefix, with the prefix removed.
// A key that is a "directory" marker, or sits deeper, is left out.
func (s *S3) List(ctx context.Context) ([]Entry, error) {
	keyPrefix := ""
	if s.prefix != "" {
		keyPrefix = s.prefix + "/"
	}
	var (
		out   []Entry
		token string
	)
	for range maxListPages {
		params := map[string]string{
			"list-type": "2",
			"delimiter": "/",
			"prefix":    keyPrefix,
		}
		if token != "" {
			params["continuation-token"] = token
		}
		resp, err := s.do(ctx, "list", "", canonicalQuery(params))
		if err != nil {
			return nil, err
		}
		var page listResult
		err = xml.NewDecoder(io.LimitReader(resp.Body, maxListBytes)).Decode(&page)
		_ = resp.Body.Close() // the page is decoded, a close error changes nothing
		if err != nil {
			return nil, fmt.Errorf("decode bucket listing: %w", err)
		}
		for _, c := range page.Contents {
			name := strings.TrimPrefix(c.Key, keyPrefix)
			if name == "" || strings.Contains(name, "/") {
				continue
			}
			out = append(out, Entry{Name: name, Size: c.Size})
		}
		if !page.IsTruncated || page.NextContinuationToken == "" {
			return out, nil
		}
		token = page.NextContinuationToken
	}
	return nil, fmt.Errorf("bucket listing has more than %d pages", maxListPages)
}

// Open returns the object called name under the prefix. The body is the live
// HTTP response: the caller closes it.
func (s *S3) Open(ctx context.Context, name string) (*Object, error) {
	if !Valid(name) {
		return nil, ErrNotFound
	}
	key := name
	if s.prefix != "" {
		key = s.prefix + "/" + name
	}
	resp, err := s.do(ctx, "get", key, "")
	if err != nil {
		return nil, err
	}
	return &Object{Body: resp.Body, Size: resp.ContentLength}, nil
}

// do sends one signed GET and returns the reply of a 200. A 404 is
// ErrNotFound, any other status a *StatusError. key is empty for the bucket
// itself.
func (s *S3) do(ctx context.Context, op, key, rawQuery string) (*http.Response, error) {
	u := *s.base
	path := strings.TrimRight(s.base.Path, "/") + "/" + s.bucket
	if key != "" {
		path += "/" + key
	}
	u.Path = path
	u.RawPath = uriEncode(path, true)
	u.RawQuery = rawQuery
	u.Fragment = ""

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("build bucket %s request: %w", op, err)
	}
	sign(req, s.creds, s.region, s3Service, s.now())

	resp, err := s.client.Do(req)
	if err != nil {
		// The URL error holds the URL, which holds no secret: the key is in a
		// header, not in the query.
		return nil, fmt.Errorf("bucket %s: %w", op, err)
	}
	if resp.StatusCode == http.StatusOK {
		return resp, nil
	}
	defer func() { _ = resp.Body.Close() }() // the status is the result, nothing is read after it
	if resp.StatusCode == http.StatusNotFound && op == "get" {
		return nil, ErrNotFound
	}
	return nil, &StatusError{Op: op, Status: resp.StatusCode, Code: errorCode(resp.Body)}
}

// errorCode reads the <Code> of an S3 error document, or "" when there is
// none.
func errorCode(body io.Reader) string {
	var doc struct {
		Code string `xml:"Code"`
	}
	if err := xml.NewDecoder(io.LimitReader(body, 64<<10)).Decode(&doc); err != nil {
		return ""
	}
	// Only a short token of plain characters is kept, so the code can go into
	// a log line as is.
	code := doc.Code
	if len(code) > 64 {
		return ""
	}
	for _, r := range code {
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') {
			return ""
		}
	}
	return code
}
