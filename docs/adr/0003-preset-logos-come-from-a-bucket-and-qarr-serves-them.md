# 0003. Preset logos come from a bucket and qarr serves them

## Status

accepted

## Context

- The preset logos belong to their owners, not to this repository, and the repository is public.
- The browser renders ([0001](0001-the-browser-renders-the-api-is-a-second-surface.md)), so the
  page needs the logo bytes locally, not a server side composite.
- The page draws the logo onto a canvas and reads it back twice: once to export the image, once to
  decode the result and check it still scans.
- A canvas that has drawn an image from another origin is tainted, and those reads then throw.
  Untainting needs `crossorigin="anonymous"` on the image and a matching
  `Access-Control-Allow-Origin` from wherever it came.
- govue's `middleware.Security` sets a deny by default Content Security Policy, and a second
  origin for images would have to be added to it.
- The estate already has SeaweedFS as its S3, buckets declared in OpenTofu, read only users per
  bucket and their keys in OpenBao, served through NGINX's S3 gateway (infra ADR 54).
- Logos change without the code changing: a new preset should not need a release.

## Decision

We will keep the logos outside the repository, and have the qarr binary read them with a read
only credential and serve the files under its own origin.

- A deployment points at a SeaweedFS bucket in this estate, or at a local directory for a simpler
  deployment; qarr reads whichever is configured the same way.
- Same origin removes the canvas tainting question, the CORS configuration and the CSP widening
  in one step, rather than solving each separately.
- The bucket stays private: no anonymous read, no public bucket, no second hostname.
- The preset list is what the configured source holds, so adding a logo is an upload, not a
  deploy.
- The repository carries names at most, never an image.

## Consequences

- Positive: no image file in a public repository, and no rights question to answer before the
  first release.
- Positive: the page fetches the logo from the origin it was served from, which needs no CSP
  entry and cannot taint a canvas.
- Negative: the binary gains an S3 client, a directory reader and a credential, in an app that
  otherwise has neither.
- Negative: an operator has to have the bucket or the directory in place, which is one more thing
  to get right before the presets are useful.
- Neutral: the dependency is deliberately soft. If the configured source is unreachable, the
  presets are unavailable and everything else, upload included, still works. Readiness therefore
  does not check it, which keeps the readiness contract of one check per dependency the app
  cannot serve without.
- Neutral: the app caches what it fetched, so a replaced logo appears after the cache expires
  rather than at once.

## Alternatives considered

### A second NGINX S3 gateway, as infra ADR 54 does for downloads

- Exactly the established pattern, and no S3 client in qarr.
- Rejected because it is a cross origin fetch: it needs CORS on the bucket, an extra origin in
  the CSP, and `crossorigin` handling in the page, or the canvas reads fail. That is three
  problems where serving it ourselves is none.

### An existing downloads bucket behind its own hostname

- No new infrastructure at all.
- Rejected for the same cross origin reasons, and because qarr's assets would live in a bucket
  that belongs to a different service.

### Bundling the logos in the repository

- Simplest by far: no bucket, no key, no fetch.
- Rejected because the repository is public and the logos are not ours to publish.

### Bundling only the logos this organisation owns

- Half the problem solved, no infrastructure for the common case.
- Rejected because it splits one mechanism into two: a bundled preset and a fetched preset behave
  differently on failure, and the page would have to handle both.

## References

- Concept: [../concepts/qarr.md](../concepts/qarr.md)
- Related: [0001. The browser renders, the API is a second surface](0001-the-browser-renders-the-api-is-a-second-surface.md)
- infra ADR 54, stateless docker host apps and downloads from SeaweedFS, for the bucket, the read
  only user and the key in OpenBao
