# 0001. The browser renders, the API is a second surface

## Status

accepted

## Context

- The payload kinds include WiFi credentials and vCard contact data, which people type into the
  page before anything is generated.
- The product is positioned as privacy friendly, free and without an account, and that claim is
  what distinguishes it from the generators that already rank.
- An HTTP API is required for scripts and batch runs, and anything that is not a browser.
- A generated code has to be decoded again before it is handed out, which means the decoder has to
  exist wherever the encoder does.
- The frontend carries a page weight budget, which a public, indexable page's performance goals
  rest on.
- A key shipped in a frontend bundle is public, so the page cannot be a key holding client.

## Decision

We will render in the browser for the web interface, and run the same generation in Go behind an
API for everything else.

- A WiFi password or a private address never leaves the tab, so the privacy claim is "it never
  arrives" rather than "we do not store it".
- The page then calls no API at all, which removes the contradiction between a public page and an
  API that requires a key.
- Scripts and batch runs keep a real interface against the same generation logic, with no browser
  involved.

## Consequences

- Positive: nothing typed into the page is transmitted, so there is no payload to log, leak or
  subpoena, and no rate limit is needed to protect the page.
- Positive: the API can require a key from every caller, because no caller is the page.
- Negative: payload encoding, style rendering and the repair loop exist twice, in TypeScript and
  in Go, and the two must not drift.
- Negative: a bug fixed in one language is not fixed in the other until it is ported.
- Neutral: the drift is held by one set of golden test vectors in the repository, read by the Go
  tests and the TypeScript tests. A new payload kind or style option lands in the vectors first.
- Neutral: the vectors cover the string a scanner reads, and nothing below it. Neither the image
  bytes nor the module matrix can be made equal with libraries rather than a hand written encoder:
  two PNG encoders differ in filtering and compression at identical pixels, and the two QR
  encoders agree on the version but pick different masks, with no way to fix one.
- Neutral: what stands in for that is the decode check each side runs on its own output. A code
  that reads back as the content it was made from is correct whatever its mask.
- Neutral: the browser needs its own QR decoder, which costs part of the page weight budget.

## Alternatives considered

### Rendering on the server, as the previous implementation did

- One implementation, one repair loop, no drift.
- Rejected because every WiFi password and every vCard would travel to a server, which contradicts
  the positioning the product is built on.

### Go compiled to WebAssembly

- One core, executed in the browser: solves privacy and drift at the same time.
- Rejected because a Go WASM bundle is far past the page weight budget.
- Worth revisiting if TinyGo can carry the encoder within the budget.

### Rendering in the browser and dropping the API entirely

- Smallest surface, no key handling, no second implementation.
- Rejected because batch generation and scripted use are stated goals, and a browser is the wrong
  place for either.

## References

- Concept: [../concepts/qarr.md](../concepts/qarr.md)
- Related: [0002. The configuration lives in the page URL](0002-the-configuration-lives-in-the-page-url.md)
