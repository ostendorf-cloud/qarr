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
| `SITE_HOST` | Public host sent to Umami; required when counting is on | unset |
| `TRUSTED_PROXIES` | Comma separated CIDRs of the proxies in front of qarr; without them, behind a proxy, no view is counted | unset |
| `UMAMI_TIMEOUT`, `UMAMI_QUEUE_SIZE` | Optional govue settings: post timeout and queue size | `5s`, `256` |

## Privacy and page view counting

Counting is off unless `UMAMI_URL` and `UMAMI_WEBSITE_ID` are both set. Setting only one stops
the start.

- What you type into a QR code never reaches the server. The code is drawn in the browser, the
  page makes no request with it, and the page address keeps it in the fragment, which a browser
  never sends.
- With counting on, the server reports one page view to Umami after it served the page. No
  script runs in the browser, no cookie is set and nothing is stored on the device.
- Reported: the page as the route pattern (always `/`), never the path or a query string, the
  origin of the referring site, the browser language, the user agent and the client address
  shortened to its first three bytes (IPv4) or six (IPv6).
- Not counted: a visitor who sends Do Not Track or Global Privacy Control, prefetch, assets,
  health and metrics routes, and anything that is not a successful HTML page.
- Who runs the Umami instance, how long it keeps the data and the legal basis are the operator's
  statements, not this repository's. The page states what the software does and no more.

## Container

```sh
docker compose up --build
```

Builds the multi-stage `Dockerfile` (frontend, static Go binary, then a minimal non-root
runtime stage with no shell) and serves the app at `http://localhost:8080`.
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
