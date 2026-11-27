// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package logos

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// The AWS documentation publishes worked Signature Version 4 examples for S3
// ("Examples: Signature calculations", with the example key pair below). The
// expected signatures are theirs, not computed by this package.
const (
	exampleKeyID  = "AKIAIOSFODNN7EXAMPLE"
	exampleSecret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" //nolint:gosec // the public example key from the AWS documentation
)

func TestSign_AWSExamples(t *testing.T) {
	t.Parallel()
	at := time.Date(2013, 5, 24, 0, 0, 0, 0, time.UTC)
	creds := credentials{accessKeyID: exampleKeyID, secretAccessKey: exampleSecret}

	tests := []struct {
		name   string
		target string
		header map[string]string
		want   string
	}{
		{
			name:   "get object with a range",
			target: "https://examplebucket.s3.amazonaws.com/test.txt",
			header: map[string]string{"Range": "bytes=0-9"},
			want: "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request," +
				"SignedHeaders=host;range;x-amz-content-sha256;x-amz-date," +
				"Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
		},
		{
			name:   "get bucket lifecycle",
			target: "https://examplebucket.s3.amazonaws.com/?lifecycle=", // the canonical form of a bare "?lifecycle"
			want: "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request," +
				"SignedHeaders=host;x-amz-content-sha256;x-amz-date," +
				"Signature=fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543",
		},
		{
			name:   "list objects with a prefix and a max count",
			target: "https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J",
			want: "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request," +
				"SignedHeaders=host;x-amz-content-sha256;x-amz-date," +
				"Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, tt.target, nil)
			req.Host = "examplebucket.s3.amazonaws.com"
			for k, v := range tt.header {
				req.Header.Set(k, v)
			}
			sign(req, creds, "us-east-1", "s3", at)
			// The documentation writes the three parts without a space after
			// the comma, a server accepts both.
			got := strings.ReplaceAll(req.Header.Get("Authorization"), ", ", ",")
			if got != tt.want {
				t.Errorf("Authorization =\n%s\nwant\n%s", got, tt.want)
			}
		})
	}
}

func TestSign_ChangesWithEveryInput(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 11, 28, 10, 0, 0, 0, time.UTC)
	signature := func(secret, region, target string, when time.Time) string {
		req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, target, nil)
		sign(req, credentials{accessKeyID: "id", secretAccessKey: secret}, region, "s3", when)
		auth := req.Header.Get("Authorization")
		return auth[strings.LastIndex(auth, "Signature="):]
	}
	base := signature("secret", "us-east-1", "https://s3.example.org/b/a.svg", at)
	for name, got := range map[string]string{
		"secret": signature("other", "us-east-1", "https://s3.example.org/b/a.svg", at),
		"region": signature("secret", "eu-central-1", "https://s3.example.org/b/a.svg", at),
		"path":   signature("secret", "us-east-1", "https://s3.example.org/b/b.svg", at),
		"query":  signature("secret", "us-east-1", "https://s3.example.org/b/a.svg?x=1", at),
		"time":   signature("secret", "us-east-1", "https://s3.example.org/b/a.svg", at.Add(time.Second)),
	} {
		if got == base {
			t.Errorf("the signature did not change with the %s", name)
		}
	}
}

func TestCanonicalQuery(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		params map[string]string
		want   string
	}{
		{"empty", nil, ""},
		{"sorted by name", map[string]string{"prefix": "a/", "list-type": "2"}, "list-type=2&prefix=a%2F"},
		{"empty value keeps the equals sign", map[string]string{"prefix": ""}, "prefix="},
		{"reserved characters are encoded", map[string]string{"t": "a b+c=d~"}, "t=a%20b%2Bc%3Dd~"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := canonicalQuery(tt.params); got != tt.want {
				t.Errorf("canonicalQuery = %q, want %q", got, tt.want)
			}
		})
	}
}
