#!/usr/bin/env bash
#
# Starts the container image given as $1 and asserts it actually serves
# something real: health, readiness and metrics on the admin listener, the
# prerendered pages on the public one (the root redirect, the start pages and
# the legal pages), and that the public listener
# itself does not answer /metrics. Run by the docker-build job in
# .github/workflows/checks.yaml right after it builds and loads the image,
# so this never needs a registry.
#
# No environment variable is passed to the container: ADDR and ADMIN_ADDR
# already default to the ports this script publishes, see
# internal/config/config.go.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <image-ref>" >&2
  exit 1
fi

image="$1"
container="qarr-smoke-$$"
base_url="http://127.0.0.1:8080"
admin_url="http://127.0.0.1:8081"
ready_timeout=30
fail=0

cleanup() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    echo "---- ${container} logs ----" >&2
    docker logs "$container" 2>&1 || true
    echo "---- end ${container} logs ----" >&2
  fi
  docker rm --force "$container" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

docker run \
  --detach \
  --name "$container" \
  --publish "127.0.0.1:8080:8080" \
  --publish "127.0.0.1:8081:8081" \
  "$image" >/dev/null

# wait_for_health polls /healthz on the admin listener for up to
# ready_timeout seconds, failing immediately once the container itself
# has exited rather than waiting out the full timeout for a process that
# is already gone.
wait_for_health() {
  local elapsed=0 state exit_code
  while ((elapsed < ready_timeout)); do
    state="$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || echo false)"
    if [[ $state != "true" ]]; then
      exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$container" 2>/dev/null || echo unknown)"
      echo "${container} exited early with code ${exit_code}" >&2
      return 1
    fi
    if curl --fail --silent --show-error --max-time 2 "${admin_url}/healthz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  echo "timed out after ${ready_timeout}s waiting for /healthz" >&2
  return 1
}

if ! wait_for_health; then
  exit 1
fi

# assert_status and assert_contains each record a failure and keep going,
# rather than stopping at the first one. Both default to base_url, the
# public listener; a third argument points at a different one, the admin
# listener's admin_url.
assert_status() {
  local path="$1" want="$2" url="${3:-$base_url}" got
  got="$(curl --silent --output /dev/null --write-out '%{http_code}' "${url}${path}")" || got=""
  if [[ $got != "$want" ]]; then
    echo "GET ${url}${path}: want status ${want}, got \"${got}\"" >&2
    fail=1
  fi
}

assert_contains() {
  local path="$1" needle="$2" url="${3:-$base_url}" body
  body="$(curl --silent "${url}${path}")" || body=""
  if [[ $body != *"$needle"* ]]; then
    echo "GET ${url}${path}: missing \"${needle}\"" >&2
    fail=1
  fi
}

assert_status "/healthz" "200" "$admin_url"
assert_status "/readyz" "200" "$admin_url"
assert_status "/metrics" "200" "$admin_url"

# The public listener must never answer /metrics: that stays on the admin
# listener above, cluster-internal, never reached through the chart's own
# Ingress or HTTPRoute.
assert_status "/metrics" "404"

# "/" redirects to the start page of the visitor's language, the legal short
# paths redirect to the locale page, and qarr has no terms. curl does not
# follow redirects here, so the status is the redirect's own.
assert_status "/" "302"
assert_status "/impressum" "302"
assert_status "/agb" "404"

for page in /de/ /en/ /de/imprint /en/privacy; do
  assert_status "$page" "200"
  assert_contains "$page" "<html"
done

if [[ $fail -ne 0 ]]; then
  echo "smoke test failed" >&2
  exit 1
fi

echo "smoke test passed"
