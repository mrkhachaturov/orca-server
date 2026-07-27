#!/usr/bin/env bash

# Boot the built AppImage headless and check that it actually serves the web
# client. This is the one test that exercises the product rather than the
# series: everything else can pass while the thing refuses to start.
#
#   ./ci/build/build-appimage.sh && ./ci/dev/test-e2e.sh
#
# Linux/amd64 only — the AppImage is a Linux binary.

set -Eeuo pipefail

PORT="${PORT:-6799}"
TIMEOUT="${TIMEOUT:-120}"

main() {
  cd "$(dirname "$0")/../.."

  source ./ci/lib.sh

  if [[ $OS != "linux" && $OS != "alpine" ]]; then
    echo >&2 "e2e runs on Linux only (this is $OS); the artifact is a Linux AppImage"
    exit 1
  fi

  local appimage
  appimage="$(find "$RELEASE_PATH" -maxdepth 1 -name '*.AppImage' -print -quit 2> /dev/null)"
  if [[ -z ${appimage-} ]]; then
    echo >&2 "no AppImage in $RELEASE_PATH — run ./ci/build/build-appimage.sh first"
    exit 1
  fi

  local work
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT

  # Containers and LXCs usually have no FUSE; extraction is the supported path
  # and keeps stdout free of the wrapper's own chatter.
  pushd "$work"
  "$OLDPWD/$appimage" --appimage-extract > /dev/null
  popd

  # The entry point is the CLI shim, NEVER squashfs-root/AppRun. AppRun is the
  # Electron desktop entry point and silently ignores a `serve` positional: it
  # boots the GUI with the stock server on another port and reports success.
  local shim="$work/squashfs-root/resources/bin/orca-ide"
  if [[ ! -x $shim ]]; then
    echo >&2 "CLI shim missing at $shim — the package layout changed"
    exit 1
  fi

  echo "Starting serve on 127.0.0.1:$PORT"
  # ORCA_APPIMAGE_NO_SANDBOX must be an env var: --no-sandbox is not in serve's
  # allowed flags, so passing it as a flag makes the CLI reject the launch.
  LIBGL_ALWAYS_SOFTWARE=1 ORCA_APPIMAGE_NO_SANDBOX=1 \
    dbus-run-session -- xvfb-run -a \
    "$shim" serve --trusted-proxy --port "$PORT" \
    > "$work/serve.log" 2>&1 &
  local serve_pid=$!
  trap 'kill "$serve_pid" 2>/dev/null || true; rm -rf "$work"' EXIT

  # Health is GET /web-index.html. Not /trusted-session, which 503s until an
  # offer is minted, and not the WebSocket port.
  local waited=0
  until curl -fsS -o /dev/null "http://127.0.0.1:$PORT/web-index.html"; do
    if ! kill -0 "$serve_pid" 2> /dev/null; then
      echo >&2 "serve exited before it was ready:"
      tail -40 "$work/serve.log" >&2
      exit 1
    fi
    if ((waited >= TIMEOUT)); then
      echo >&2 "serve did not answer within ${TIMEOUT}s:"
      tail -40 "$work/serve.log" >&2
      exit 1
    fi
    sleep 2
    waited=$((waited + 2))
  done

  echo "Web client served after ${waited}s"

  # Trusted-proxy mode must bind loopback only — that bind is the whole proof
  # that the request came through the proxy that authenticated it.
  if command -v ss > /dev/null && ss -ltn | grep -q "0.0.0.0:$PORT"; then
    echo >&2 "serve is listening on 0.0.0.0 — trusted-proxy mode did not take effect"
    exit 1
  fi

  echo "OK"
}

main "$@"
