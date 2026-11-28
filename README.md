# qarr

QR codes with your own content, colours and logo, generated in your browser.

## Install

```sh
task setup
```

Installs the pinned toolchain (Go, Node, pnpm, and the lint and release tooling) through `mise`.

## Use

```sh
task build   # builds the frontend, then compiles bin/qarr
bin/qarr
```

The server reads its configuration from the environment; see the Configuration table below.
It serves the embedded single page application on its public listener, and health, readiness
and metrics on a second, administrative listener, never on the public one.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `ADDR` | Address the public HTTP server listens on | `:8080` |
| `ADMIN_ADDR` | Address govue's admin listener listens on: `/healthz`, `/readyz` and `/metrics` | `:8081` |
| `LOG_LEVEL` | `debug`, `info`, `warn` or `error` | `info` |
| `UMAMI_URL` | Base URL of a Umami instance; page views are reported to it from the server | unset |
| `UMAMI_WEBSITE_ID` | Umami website id (a UUID) | unset |
| `SITE_URL` | Public origin without path: canonical and hreflang links, sitemap and the Umami hostname (its bare host) | `https://qarr.de` |
| `TRUSTED_PROXIES` | Comma separated CIDRs of the proxies in front of qarr; without them, behind a proxy, no view is counted | unset |
| `UMAMI_TIMEOUT`, `UMAMI_QUEUE_SIZE` | Optional govue settings: post timeout and queue size | `5s`, `256` |
| `LOGOS_DIR` | Directory of preset logo pictures. Not together with a bucket | unset |
| `LOGOS_S3_ENDPOINT` | Base URL of the S3 compatible service. Required with a bucket | unset |
| `LOGOS_S3_BUCKET` | Bucket of preset logo pictures. Setting it selects the bucket source | unset |
| `LOGOS_S3_REGION` | Signing region | `us-east-1` |
| `LOGOS_S3_PREFIX` | Only keys below this prefix are listed | unset |
| `LOGOS_S3_ACCESS_KEY_ID`, `LOGOS_S3_ACCESS_KEY_ID_FILE` | Read-only access key id, or the path of a file holding it. Required with a bucket | unset |
| `LOGOS_S3_SECRET_ACCESS_KEY`, `LOGOS_S3_SECRET_ACCESS_KEY_FILE` | Read-only secret access key, or the path of a file holding it. Required with a bucket | unset |

## Preset logos

- With neither `LOGOS_DIR` nor a bucket set, the page offers upload only and the server says so
  once at startup.
- One source at most. A directory and any `LOGOS_S3_*` setting together stop the start.
- A configured source that cannot be read stops the start with one error.
- The server lists the pictures at `/logos.json` and serves each one at `/logos/<name>` on its own
  origin, never by a redirect. The server keeps the list for 60 seconds, so a picture added to
  the source shows up within a minute. A browser keeps a picture for an hour.
- Served: PNG, JPEG and SVG files of at most 2 MiB, with a plain file name, at the top level of
  the source.
- Prefer the `_FILE` variables for the key pair, so the key stays out of the process environment.

## Privacy and page view counting

Counting is off unless `UMAMI_URL` and `UMAMI_WEBSITE_ID` are both set. Setting only one stops
the start.

- What you type into a QR code is not sent to the server. The code is drawn in the browser, the
  page makes no request with it, and the page address keeps it in the fragment, which a browser
  never sends. It does stay in the browser, including its history. The guided forms (WiFi,
  contact, appointment, telephone number, SEPA transfer) work the same way: their entries are
  put together in the browser and live in that fragment.
- With preset logos on, the page asks its own origin for the list and for a preset you pick.
  Neither request carries what you typed. A logo you upload stays in the browser.
- With counting on, the server reports one page view to Umami after it served the page.
  Counting needs no script in the browser, sets no cookie and stores nothing on the device.
- Reported: the page as the route pattern (`/de/`, `/en/`, `/de/imprint` and so on), never the
  path or a query string, the origin of the referring site, the browser language, the user agent
  and the client address shortened to its first three bytes (IPv4) or six (IPv6). Umami derives
  country, region and city from the shortened address.
- Not counted: a visitor who sends Do Not Track or Global Privacy Control, prefetch, assets,
  preset logo requests, health and metrics routes, and anything that is not a successful HTML
  page.
- Who runs the Umami instance, how long it keeps the data and the legal basis are the operator's
  statements, not this repository's. The page states what the software does and no more.
- The text lives in the privacy page, `web/src/pages/PrivacyPage.vue`, in German and English.
  The start page only links it, so the two cannot disagree.

## Legal pages

- `/de/imprint`, `/en/imprint`, `/de/privacy` and `/en/privacy` are prerendered with the start
  pages `/de/` and `/en/` by `task web:build`, which then runs `govue-check-legal` on the result.
- `/imprint`, `/privacy`, `/impressum`, `/datenschutz` and `/datenschutzerklaerung` redirect to the
  matching page. `/terms` and `/agb` answer 404: qarr has no terms.
- `/` redirects to the start page of the visitor's language.
- The texts are `web/src/pages/ImprintPage.vue` and `PrivacyPage.vue`. The sitemap origin is
  `ORIGIN` in `web/src/entry-prerender.ts`.

## Container

```sh
docker compose up --build
```

Builds the multi-stage `Dockerfile` (frontend, static Go binary, then a minimal non-root
runtime stage with no shell) and serves the app at `http://localhost:8080`.
The published image is one manifest list for `linux/amd64` and `linux/arm64`.
`docker-compose.yaml` is for local development only; see `charts/qarr/README.md` for a cluster
installation.

## Development

```sh
task setup
task check
```

`task check` runs every lint, build and test target one after another; `task --list` shows them
individually. `task web:build` has to run before `task build` or `task test:go` can compile
`cmd/qarr`, since it embeds the built frontend; `task build` and `task test:go` already declare
that dependency, so running either one through Task is enough.

Releases are driven by [release-me](https://github.com/ostendorf-cloud/release-me): Conventional
Commits decide the version, and merging the release pull request it maintains cuts the release.
`CHANGELOG.md` is generated, never hand edited.

## License

Apache-2.0. See [LICENSE](LICENSE).
