# 0004. Batch generation runs in the browser and is capped

## Status

proposed

## Context

- A batch is a CSV of rows, one code per row, as an archive or a cut-marked PDF sheet.
- A row can carry a WiFi password or contact data, the payloads
  [0001](0001-the-browser-renders-the-api-is-a-second-surface.md) keeps out of every server.
- The page calls no API, and the API requires a key from every caller, which 0001 depends on.
- The decode check runs on every code, so a batch pays encode, draw and decode per row.
- A drawn code is a raw RGBA buffer of 420 KiB at the default style, so a batch cannot hold them
  all at once.
- Measured with the same libraries and defaults as `web/src/qr` (`qrcode-generator` 2.0.4,
  `jsqr` 1.4.0, level M, 8 pixels per module, quiet zone 4, WiFi payload of about 60
  characters), Node 24 on an Apple silicon laptop, no PNG or PDF encoding, no logo:
  4.8 to 6.3 ms per code, of which decode is about 4 ms.
- That is 1000 codes in about 5 s and 5000 codes in about 29 s, on the main thread of a fast
  machine. A phone is slower by an unmeasured factor, and a browser tab was not measured.

## Decision

We will generate batches in the browser, in a worker, one code at a time, with an upper bound of
1000 rows per batch.

- The page reads the CSV locally, draws and checks each code, hands it to the archive or sheet
  writer and drops the buffer, so memory stays flat at one code plus the output.
- Past 1000 rows the page generates nothing, says so with the row count, and points to splitting
  the file or to the API. It never truncates a batch silently.
- The CSV never leaves the tab, so 0001 holds unchanged and no exception to it is needed.
- The API stays the surface for larger or scripted batches. A caller with a key is a different
  trust situation from a visitor, and the CSV reaches the server only when that caller sends it.
- The API's own batch limit is set when it is built, and is not decided here.

## Consequences

- Positive: the privacy claim of 0001 stays "it never arrives" for batches too.
- Positive: no new server code, upload path, request size limit or log to protect for this
  feature.
- Negative: a visitor with more than 1000 rows has to split the file or use the API, which needs
  a key.
- Negative: the worker, the archive writer and the PDF writer are client code that adds to the
  page weight budget, and the budget impact is not measured yet.
- Negative: the 1000 row bound comes from a Node measurement, not from browsers. The
  implementation issue re-measures in a real browser and on a slow phone, and may lower the
  bound.
- Neutral: PNG encoding, archive writing and the sheet layout are not in the measured cost.
- Neutral: the bound is one constant, so changing it needs no new record unless the decision
  changes.

## Alternatives considered

### Generating batches on the server

- One implementation, no client load, no bound set by a phone.
- Rejected because the uploaded CSV can hold WiFi passwords and contact data, which contradicts
  0001 for exactly the data it protects, and the page would need a key or an open endpoint.

### A page upload to the API with a key held by the user

- Reuses the API, so no client side batch code.
- Rejected because the page would call the API, which 0001 rules out, and a key typed into a page
  is a credential in a public frontend.

### Browser without a bound

- Simplest rule, no refusal path.
- Rejected because cost grows with the row count while memory and time on a phone are unmeasured,
  and a tab that stalls on a large file gives no useful error.

## References

- Concept: [../concepts/qarr.md](../concepts/qarr.md)
- Related: [0001. The browser renders, the API is a second surface](0001-the-browser-renders-the-api-is-a-second-surface.md)
