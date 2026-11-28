# Preset logos

`internal/logos` serves them, `web/src/presets` asks for them. See
[0003](../../docs/adr/0003-preset-logos-come-from-a-bucket-and-qarr-serves-them.md).

- Two sources, never both: `LOGOS_DIR`, or an S3 bucket (`LOGOS_S3_*`, path style, own SigV4
  client). The region defaults to `us-east-1`. With neither, the page offers upload only.
- Routes `/logos.json` (`no-store` for the browser) and `/logos/{name}` (cached one hour), on
  this origin and never a redirect, so the canvas stays untainted.
- The server keeps the listing in memory for 60 seconds (`listingTTL`), one refresh at a time,
  and serves the stale one when a refresh fails. A picture is opened at the source only when
  the listing holds its name.
- Served: PNG, JPEG and SVG, a plain file name, at most 2 MiB (`logos.MaxBytes`, equal to
  `MAX_LOGO_BYTES` in `web/src/qr/logo.ts`). The page reads a preset like an uploaded file.
  A source that reports no size is read up to the limit before the status is sent, so a
  picture over it answers 404, never a cut off 200.
- An unreadable source stops the start. After that the presets are a soft dependency: no
  readiness check, `/logos.json` answers 502 when the source fails.
- The two routes are not pages, so the view counter never reports them. No `Options.Skip` needed.
- A change to what the page requests needs an update of `web/src/pages/PrivacyPage.vue`.
