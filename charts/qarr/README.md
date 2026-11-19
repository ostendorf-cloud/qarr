# qarr

Installs [qarr](https://github.com/ostendorf-cloud/qarr) on a Kubernetes cluster.

## Prerequisites

- Kubernetes 1.27 or newer.
- Only if `httpRoute.enabled` is set: the Gateway API CRDs and a running `Gateway` with a
  listener that allows this release's namespace. See "External routing" below; this chart
  ships neither.

## Installing

```sh
helm install qarr charts/qarr
```

This chart has no secret-shaped setting yet, so it needs no `existingSecret` value to
install. See "Configuration" below for what it does accept.

This chart is also published as an OCI artifact, at `oci://ghcr.io/ostendorf-cloud/charts/qarr`,
versioned in lock-step with every release:

```sh
helm install qarr oci://ghcr.io/ostendorf-cloud/charts/qarr --version <version>
```

or pull it without installing:

```sh
helm pull oci://ghcr.io/ostendorf-cloud/charts/qarr --version <version>
```

## Configuration

| `values.yaml` key | Env var | Default | Purpose |
| --- | --- | --- | --- |
| `config.listenAddr` | `ADDR` | `:8080` | Public listener, the embedded SPA |
| `config.adminListenAddr` | `ADMIN_ADDR` | `:8081` | govue's admin listener: `/healthz`, `/readyz`, `/metrics` |
| `config.logLevel` | `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` |
| `config.umami.url` | `UMAMI_URL` | empty | Umami base URL; counting is on only with the website id too. Not a secret |
| `config.umami.websiteId` | `UMAMI_WEBSITE_ID` | empty | Umami website id, a UUID. Not a secret |
| `config.siteHost` | `SITE_HOST` | empty | Public host sent to Umami; required when counting is on |
| `config.trustedProxies` | `TRUSTED_PROXIES` | empty | CIDRs of the proxies in front of qarr; set it behind an ingress or no view is counted |

`service.port` and `service.adminPort` must match whatever port `config.listenAddr` and
`config.adminListenAddr` themselves encode; the probes and the container ports are derived
from `service.*`, not from `config.*`, so the two are kept in step by hand.

## External routing

`ingress.enabled` and `httpRoute.enabled` are two ways to reach this chart's Service from
outside the cluster, each off by default. They are mutually exclusive: turning both on fails
the render, naming which one to turn off. Neither ever routes to `service.adminPort`, govue's
admin listener; only `service.port` is ever exposed externally.

An enabled `httpRoute` requires `httpRoute.parentRefs.name` and
`httpRoute.parentRefs.namespace`, naming the `Gateway` it attaches to; both fail the render when
left empty, since neither has a default that could point at a `Gateway` that actually exists.

## Verification

```sh
helm lint charts/qarr
helm template charts/qarr | kubeconform -strict -summary
helm unittest charts/qarr
```

`helm lint` cannot see a render-time `fail`: it is logged, not propagated, and the exit code
stays zero. The `helm-unittest` suites under `tests/` are what actually exercise every guard,
including the must-fail combinations.

## Uninstalling

```sh
helm uninstall qarr
```

Removes every object this chart created. There is no `Secret`, `PersistentVolumeClaim` or other
stateful object left behind: qarr keeps no server-side state in this milestone.
