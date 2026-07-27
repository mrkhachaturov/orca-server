#!/usr/bin/env bash
#MISE description="Boot the built AppImage and fetch the web client"
#MISE dir="{{config_root}}"

# Needs `mise run build` first; no depends, dist/ is an input.
# Linux only, on a host of the artifact's arch. The gate below tests the OS, not
# the arch — dist/ holds whatever this machine built.

set -Eeuo pipefail

PORT="${PORT:-6799}"
TIMEOUT="${TIMEOUT:-120}"

# File-scope, not `local` in main: the EXIT trap fires after main returns, and
# under `set -u` a gone local aborts the script after a passing run — red e2e,
# and serve left behind because the kill never ran.
work=""
serve_pid=""

cleanup() {
  if [[ -n $serve_pid ]]; then
    kill "$serve_pid" 2> /dev/null || true
  fi
  if [[ -n $work ]]; then
    rm -rf "$work"
  fi
}
trap cleanup EXIT

main() {

  source ./.mise/lib.sh

  if [[ $OS != "linux" && $OS != "alpine" ]]; then
    echo >&2 "e2e runs on Linux only (this is $OS); the artifact is a Linux AppImage"
    exit 1
  fi

  local appimage
  appimage="$(find "$RELEASE_PATH" -maxdepth 1 -name '*.AppImage' -print -quit 2> /dev/null)"
  if [[ -z ${appimage-} ]]; then
    echo >&2 "no AppImage in $RELEASE_PATH — run mise run build first"
    exit 1
  fi

  work="$(mktemp -d)"

  # Containers and LXCs usually have no FUSE, so extract rather than mount.
  pushd "$work"
  "$OLDPWD/$appimage" --appimage-extract > /dev/null
  popd

  # NEVER squashfs-root/AppRun: it is the Electron desktop entry point and
  # silently ignores a `serve` positional, booting the GUI and reporting success.
  local shim="$work/squashfs-root/resources/bin/orca-ide"
  if [[ ! -x $shim ]]; then
    echo >&2 "CLI shim missing at $shim — the package layout changed"
    exit 1
  fi

  echo "Starting serve on 127.0.0.1:$PORT"
  # Env var, not a flag: --no-sandbox is not in serve's allowlist and the CLI
  # rejects the launch.
  LIBGL_ALWAYS_SOFTWARE=1 ORCA_APPIMAGE_NO_SANDBOX=1 \
    dbus-run-session -- xvfb-run -a \
    "$shim" serve --trusted-proxy --port "$PORT" \
    > "$work/serve.log" 2>&1 &
  serve_pid=$!

  # Not /trusted-session, which 503s until an offer is minted.
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

  # The loopback bind is the whole proof that the proxy authenticated the request.
  if command -v ss > /dev/null && ss -ltn | grep -q "0.0.0.0:$PORT"; then
    echo >&2 "serve is listening on 0.0.0.0 — trusted-proxy mode did not take effect"
    exit 1
  fi

  echo "OK"
}

main "$@"
