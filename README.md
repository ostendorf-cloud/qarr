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
