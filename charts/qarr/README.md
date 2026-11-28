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

A default install needs no `Secret`. The one secret-shaped setting is the read-only key of a
preset logo bucket, and the bucket is optional. See "Preset logos" below.

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
| `config.siteUrl` | `SITE_URL` | empty | Public origin without path; canonical links, sitemap and the Umami hostname come from it. Empty keeps `https://qarr.de` |
| `config.trustedProxies` | `TRUSTED_PROXIES` | empty | CIDRs of the proxies in front of qarr; set it behind an ingress or no view is counted |
| `config.logos.directory.path` | `LOGOS_DIR` | empty | Absolute path the logo directory is mounted at, read only. Empty means no directory source |
| `config.logos.directory.volume` | none | `{}` | A Kubernetes volume source mounted at `path`, for example `{persistentVolumeClaim: {claimName: logos}}` |
| `config.logos.s3.endpoint` | `LOGOS_S3_ENDPOINT` | empty | Base URL of the S3 compatible service. Path style addressing |
| `config.logos.s3.bucket` | `LOGOS_S3_BUCKET` | empty | Bucket name |
| `config.logos.s3.region` | `LOGOS_S3_REGION` | empty | Signing region. Empty keeps the application default `us-east-1` |
| `config.logos.s3.prefix` | `LOGOS_S3_PREFIX` | empty | Only keys below this prefix are listed |
| `config.logos.s3.existingSecret.name` | none | empty | Name of a `Secret` in the release namespace that holds the read-only key pair |
| `config.logos.s3.existingSecret.accessKeyIdKey` | `LOGOS_S3_ACCESS_KEY_ID_FILE` | `access-key-id` | Key in that `Secret` holding the access key id, mounted as a file |
| `config.logos.s3.existingSecret.secretAccessKeyKey` | `LOGOS_S3_SECRET_ACCESS_KEY_FILE` | `secret-access-key` | Key in that `Secret` holding the secret access key, mounted as a file |

`service.port` and `service.adminPort` must match whatever port `config.listenAddr` and
`config.adminListenAddr` themselves encode; the probes and the container ports are derived
from `service.*`, not from `config.*`, so the two are kept in step by hand.

## Preset logos

Presets come from a directory or from an S3 compatible bucket. Neither is required: with none
set, the page offers upload only. The pictures are never part of this chart or of the image.

- Directory: set `config.logos.directory.path` and `config.logos.directory.volume`. The chart
  mounts the volume read only at that path.
- Bucket: set `config.logos.s3.endpoint`, `bucket` and `existingSecret.name`. The `Secret` has to
  exist already. The chart never creates it and never takes the key as a value.
- The key reaches the container as two files, not as environment variables. The chart mounts the
  `Secret` read only with mode `0400` at `/var/run/secrets/qarr/logos-s3`, takes the file names
  from `accessKeyIdKey` and `secretAccessKeyKey`, and sets `LOGOS_S3_ACCESS_KEY_ID_FILE` and
  `LOGOS_S3_SECRET_ACCESS_KEY_FILE` to the two paths. The key is never written into the pod
  spec and stays out of the process environment. The non root user reads the files through the
  pod's `fsGroup`, so a `podSecurityContext` without one cannot read them.

The render fails, naming the value, in these cases:

- A directory and a bucket are both set.
- `directory.path` is set without `directory.volume`, or the other way round.
- Any bucket value is set and `s3.endpoint`, `s3.bucket` or `s3.existingSecret.name` is empty.

A source that is set but unreadable stops the pod at startup with one error. After startup the
presets are a soft dependency: readiness does not check them and upload keeps working.

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

Removes every object this chart created. The chart creates no `Secret`, `PersistentVolumeClaim`
or other stateful object, and qarr keeps no server-side state. A `Secret` named by
`config.logos.s3.existingSecret` and a claim behind `config.logos.directory.volume` belong to
you and stay.
