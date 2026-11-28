// Copyright 2026 Simon Ostendorf
// SPDX-License-Identifier: Apache-2.0

package logos

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"sort"
	"strings"
	"time"
)

// This file signs a request with AWS Signature Version 4, the scheme every S3
// compatible server accepts. It signs bodyless requests only, which is all a
// read only client sends. The hand written signer replaces a whole S3 SDK
// for two GET calls; sigv4_test.go proves it against the examples AWS
// publishes.

const (
	signingAlgorithm = "AWS4-HMAC-SHA256"
	// emptyPayloadHash is the SHA-256 of an empty body.
	emptyPayloadHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
)

// credentials are the read only key pair of a bucket.
type credentials struct {
	accessKeyID     string
	secretAccessKey string
}

// sign adds the x-amz-content-sha256 and x-amz-date headers and the
// Authorization header to req. Every header already on req is signed, with
// the host. The query of req.URL must already be in canonical form, see
// canonicalQuery.
func sign(req *http.Request, c credentials, region, service string, now time.Time) {
	now = now.UTC()
	stamp := now.Format("20060102T150405Z")
	date := now.Format("20060102")

	req.Header.Set("X-Amz-Content-Sha256", emptyPayloadHash)
	req.Header.Set("X-Amz-Date", stamp)

	host := req.Host
	if host == "" {
		host = req.URL.Host
	}
	headers := map[string]string{"host": host}
	for name, values := range req.Header {
		if strings.EqualFold(name, "Authorization") {
			continue
		}
		headers[strings.ToLower(name)] = strings.Join(trimAll(values), ",")
	}
	names := make([]string, 0, len(headers))
	for name := range headers {
		names = append(names, name)
	}
	sort.Strings(names)

	var canonicalHeaders strings.Builder
	for _, name := range names {
		canonicalHeaders.WriteString(name + ":" + headers[name] + "\n")
	}
	signedHeaders := strings.Join(names, ";")

	canonicalRequest := strings.Join([]string{
		req.Method,
		req.URL.EscapedPath(),
		req.URL.RawQuery,
		canonicalHeaders.String(),
		signedHeaders,
		emptyPayloadHash,
	}, "\n")

	scope := date + "/" + region + "/" + service + "/aws4_request"
	stringToSign := strings.Join([]string{
		signingAlgorithm,
		stamp,
		scope,
		hexSHA256([]byte(canonicalRequest)),
	}, "\n")

	key := hmacSHA256([]byte("AWS4"+c.secretAccessKey), date)
	key = hmacSHA256(key, region)
	key = hmacSHA256(key, service)
	key = hmacSHA256(key, "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(key, stringToSign))

	req.Header.Set("Authorization", signingAlgorithm+
		" Credential="+c.accessKeyID+"/"+scope+
		", SignedHeaders="+signedHeaders+
		", Signature="+signature)
}

// canonicalQuery renders query parameters the way SigV4 wants them: names and
// values encoded, sorted by name. It is used as the request's own query too,
// so what is signed is what is sent.
func canonicalQuery(params map[string]string) string {
	names := make([]string, 0, len(params))
	for name := range params {
		names = append(names, name)
	}
	sort.Strings(names)
	pairs := make([]string, 0, len(names))
	for _, name := range names {
		pairs = append(pairs, uriEncode(name, false)+"="+uriEncode(params[name], false))
	}
	return strings.Join(pairs, "&")
}

// uriEncode percent encodes s the way SigV4 does: every byte except the
// unreserved characters, and the slash only when keepSlash is set.
func uriEncode(s string, keepSlash bool) string {
	const hexDigits = "0123456789ABCDEF"
	var b strings.Builder
	for i := range len(s) {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9',
			c == '-', c == '_', c == '.', c == '~':
			b.WriteByte(c)
		case c == '/' && keepSlash:
			b.WriteByte(c)
		default:
			b.WriteByte('%')
			b.WriteByte(hexDigits[c>>4])
			b.WriteByte(hexDigits[c&15])
		}
	}
	return b.String()
}

func trimAll(values []string) []string {
	out := make([]string, len(values))
	for i, v := range values {
		out[i] = strings.Join(strings.Fields(v), " ")
	}
	return out
}

func hmacSHA256(key []byte, data string) []byte {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(data)) // hash.Hash.Write never returns an error
	return m.Sum(nil)
}

func hexSHA256(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
