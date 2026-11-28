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
	"strconv"
)

const (
	// ListPath is the route of the listing.
	ListPath = "/logos.json"
	// PicturePrefix is the route prefix of a picture: "/logos/<name>".
	PicturePrefix = "/logos/"

	// pictureCache is how long a browser or a proxy keeps a picture. A preset
	// changes rarely and an hour keeps a replaced one from lingering for long.
	pictureCache = "public, max-age=3600"
	// pictureCSP is sent with every picture. The page loads a picture as an
	// image, where no script runs. The header covers the other way in: an SVG
	// opened on its own address.
	pictureCSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
)

// listing is the body of ListPath.
type listing struct {
	Logos []listed `json:"logos"`
}

type listed struct {
	// Name is the file name, which is also the label the page shows.
	Name string `json:"name"`
	// URL is the path of the picture, on this origin.
	URL string `json:"url"`
}

// Register adds the listing and the picture route to mux. Both answer on this
// origin only: a picture is read from the source and written to the reply, it
// is never a redirect, so a canvas that draws it stays untainted.
func Register(mux *http.ServeMux, src Source, logger *slog.Logger) {
	h := &handler{src: src, logger: logger}
	mux.HandleFunc("GET "+ListPath, h.list)
	mux.HandleFunc("GET "+PicturePrefix+"{name}", h.picture)
}

type handler struct {
	src    Source
	logger *slog.Logger
}

// list answers with the pictures the source holds. It is never cached, so a
// picture added to the source shows up on the next visit.
func (h *handler) list(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	entries, err := h.src.List(r.Context())
	if err != nil {
		h.fail(r.Context(), w, "list preset logos", err)
		return
	}
	body := listing{Logos: []listed{}}
	for _, e := range Served(entries) {
		body.Logos = append(body.Logos, listed{Name: e.Name, URL: PicturePrefix + e.Name})
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if err := json.NewEncoder(w).Encode(body); err != nil {
		h.logger.WarnContext(r.Context(), "write preset logo listing", "err", err)
	}
}

// picture answers with one picture, with a cache lifetime.
func (h *handler) picture(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !Valid(name) {
		notFound(w)
		return
	}
	obj, err := h.src.Open(r.Context(), name)
	if err != nil {
		h.fail(r.Context(), w, "open preset logo", err)
		return
	}
	defer func() { _ = obj.Body.Close() }() // the picture is written or the client is gone

	if obj.Size > MaxBytes {
		notFound(w) // the listing leaves it out too
		return
	}
	// A source that reports no size is read up to the limit and one byte more
	// before the status is sent. Past the limit the picture is too big, the
	// same answer as a known size over it, never a cut off 200 that a cache
	// would keep.
	var body io.Reader = obj.Body
	size := obj.Size
	if size < 0 {
		buf, err := io.ReadAll(io.LimitReader(obj.Body, MaxBytes+1))
		if err != nil {
			h.fail(r.Context(), w, "read preset logo", err)
			return
		}
		if len(buf) > MaxBytes {
			notFound(w)
			return
		}
		body, size = bytes.NewReader(buf), int64(len(buf))
	}
	hd := w.Header()
	hd.Set("Content-Type", ContentType(name))
	hd.Set("X-Content-Type-Options", "nosniff")
	hd.Set("Content-Security-Policy", pictureCSP)
	hd.Set("Cache-Control", pictureCache)
	hd.Set("Content-Length", strconv.FormatInt(size, 10))
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}
	if _, err := io.Copy(w, io.LimitReader(body, MaxBytes)); err != nil {
		h.logger.WarnContext(r.Context(), "write preset logo", "name", name, "err", err)
	}
}

// fail answers a source error: 404 for a missing picture, 502 for anything
// else. A reply that is not a picture is never cached.
func (h *handler) fail(ctx context.Context, w http.ResponseWriter, msg string, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		notFound(w)
	case ctx.Err() != nil:
		// The client left. Nothing to answer and nothing worth a log line.
		w.WriteHeader(http.StatusRequestTimeout)
	default:
		h.logger.ErrorContext(ctx, msg, "err", err)
		w.Header().Set("Cache-Control", "no-store")
		http.Error(w, "the preset logos are not available", http.StatusBadGateway)
	}
}

func notFound(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	http.Error(w, "404 page not found", http.StatusNotFound)
}
