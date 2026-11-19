# qarr

## Problem

- qarr restarts the earlier QR generator rewrite on govue. The previous attempt depended on an
  unpublished HTTP toolkit and needed a workstation build to produce a container image at all;
  govue is published, so that blocker does not exist here.
- This repository is a scaffold today: an entry point, the two listeners, a static SPA shell, a
  Helm chart and CI. The generation itself is not built.
- Guided input, saved templates and batch generation were already named as later milestones, and
  none of the three has a settled design. That is what this document works through.

## Goals

- The browser encodes and draws the code; a payload typed into the page never reaches a server.
- The configuration lives in the page URL, so a style is shareable and reproducible with no
  account.
- A deployment points at a bucket or a directory for preset logos; qarr serves them from its own
  origin.
- The API is a second surface for scripts, closed by default, answering 401 everywhere without a
  configured key.
- Guided input for WiFi, vCard, an appointment, a telephone number and a SEPA transfer, next to
  free text.
- A named template (colours, a logo) can be saved and reused, kept in the browser only.
- A CSV of rows becomes many codes at once, as an archive or a print sheet with cut marks.

## Non goals

- No account, no server-side storage of a configuration, a template or an uploaded logo.
- No scan tracking, no link shortening, no analytics tied to a generated code.
- No general design tool: styling stays colour, logo and the guided content types, not a free
  canvas.

## Approach

- A Go binary on govue serves the embedded SPA and the admin surface (health, readiness,
  metrics); the API/CLI split the old concept carried is gone, the API is the only second
  surface.
- Rendering, the repair loop and the decode check live in the browser; the API mirrors the same
  generation in Go for scripts. See [0001](../adr/0001-the-browser-renders-the-api-is-a-second-surface.md).

### Guided input

- A guided type is a form that still serialises to the same versioned configuration the page URL
  carries; the fragment gains a `kind` and that type's fields, not a parallel channel. See
  [0002](../adr/0002-the-configuration-lives-in-the-page-url.md).
- Content never leaves the browser: unaffected, the browser still builds the string and encodes
  it, guided or not.
- Shareable as a URL: a vCard or a SEPA payload is heavier than free text. The fragment can grow
  uncomfortable to paste into a chat or a ticket well before it grows past what a browser
  accepts.
- Built: `web/src/qr/guided` holds one encoder per format, each naming its standard. The fragment
  keeps version 1 and gains optional `kind` and `fields`, so every link handed out still opens.
  The fragment carries the entries of the form, not the built string, so the string is always
  made by the current encoder. See AGENTS.md, "Guided input", for the rules and what is not
  checked.

### Saved templates

- A named template (colours, a logo reference) lives in the browser's own storage. No account, no
  server.
- An uploaded logo is not a small value and does not belong in the same small record as the
  template's metadata, nor in the URL.
- Content never leaves the browser: holds, storage stays client side.
- Shareable as a URL: unaffected for the link itself, since a shared link already carries the
  resolved colours and logo reference, not a template name. A template is a local convenience,
  not something the recipient of a link receives.

### Batch generation and a print sheet

- A CSV in, many codes out, as an archive or a cut-marked PDF sheet.
- Staying in the browser keeps both properties, but it is the heaviest client-side workload the
  app takes on: rendering and laying out as many codes as a spreadsheet holds, at once.
- Moving generation to the server keeps both properties for every single-code use of the app,
  but the uploaded CSV, which can itself carry WiFi passwords or contact data, then reaches a
  server for this one feature, which is the property the rest of the app is built against.
- Not decided; see open questions.

## Alternatives considered

- Carrying the previous attempt forward unchanged, including its HTTP toolkit dependency:
  dropped, see Problem.
- Free text only, guided input deferred again: dropped, guided input is one of this rewrite's
  stated reasons to exist.

## Open questions

- Does batch generation and the print sheet stay in the browser, or is it the first feature that
  genuinely needs the server? A server-side answer needs to be reconciled with
  [0001](../adr/0001-the-browser-renders-the-api-is-a-second-surface.md) for the CSV upload
  specifically.
- What is the size limit for a saved template's logo in browser storage, and what happens once it
  is exceeded?
- How large can a guided payload get before the page URL stops being comfortably shareable, and
  does the page warn before that point?
- Which QR decoder runs in the browser to check what was just drawn, and what does it cost in
  bundle size?

## Related ADRs

- [0001. The browser renders, the API is a second surface](../adr/0001-the-browser-renders-the-api-is-a-second-surface.md)
- [0002. The configuration lives in the page URL](../adr/0002-the-configuration-lives-in-the-page-url.md)
- [0003. Preset logos come from a bucket and qarr serves them](../adr/0003-preset-logos-come-from-a-bucket-and-qarr-serves-them.md)
