#!/usr/bin/env bash
set -euo pipefail

pushd() {
  builtin pushd "$@" > /dev/null
}

popd() {
  builtin popd > /dev/null
}

# The pinned Orca version is the submodule checkout itself — there is no second
# pin to keep in sync. Everything that needs a version number reads it here.
orca_version() {
  jq -r .version lib/orca/package.json
}

# The tag the submodule is parked on. Fails loudly when it is not on a tag at
# all, which is the state that silently produces an unreleasable build.
orca_tag() {
  git -C lib/orca describe --tags --exact-match
}

# Our version, derived from the Orca tag the submodule is on. Orca's major is
# always 1 and carries no information, so it goes and the two components that
# move stay: v1.4.156 releases as 4.156.0. The last slot is ours, so 4.156.1 is
# the same Orca with a changed series; pass it as $1. Reading it back is "take
# the first two fields and prepend 1.".
#
# This lives here, not in the release workflow, so a local build and a CI build
# name the artifact identically.
orca_server_version() {
  local tag patch
  tag="$(orca_tag)"
  tag="${tag#v}"
  patch="${1:-0}"
  echo "${tag#*.}.${patch}"
}

# Orca declares its own toolchain and we match it — a newer pnpm breaks the
# frozen lockfile, a newer node is not what upstream builds against.
orca_node_version() {
  jq -r .engines.node lib/orca/package.json
}

orca_pnpm_version() {
  jq -r .packageManager lib/orca/package.json | sed -E 's/^pnpm@([^+]+).*/\1/'
}

os() {
  osname=$(uname | tr '[:upper:]' '[:lower:]')
  case $osname in
    linux)
      ldd_output=$(ldd --version 2>&1 || true)
      if echo "$ldd_output" | grep -iq musl; then
        osname="alpine"
      fi
      ;;
    darwin) osname="macos" ;;
    cygwin* | mingw*) osname="windows" ;;
  esac
  echo "$osname"
}

arch() {
  cpu="$(uname -m)"
  case "$cpu" in
    aarch64) cpu=arm64 ;;
    x86_64) cpu=amd64 ;;
  esac
  echo "$cpu"
}

if [[ ! ${ARCH-} ]]; then
  ARCH=$(arch)
  export ARCH
fi

if [[ ! ${OS-} ]]; then
  OS=$(os)
  export OS
fi

# RELEASE_PATH is the destination directory for the built AppImage, from the
# repo root. Defaults to dist (gitignored).
if [[ ! ${RELEASE_PATH-} ]]; then
  RELEASE_PATH="dist"
  export RELEASE_PATH
fi

run-steps() {
  local -i failed=0
  mkdir -p .cache
  rm -f .cache/checklist
  while (($#)); do
    local name=$1
    shift
    local fn=$1
    shift
    echo "$name..."
    # Only run if an earlier step has not failed.
    # For all failed steps, write out an empty checkbox.
    if [[ $failed == 0 ]]; then
      if $fn | indent; then
        echo "- [X] $name" >> .cache/checklist
      else
        ((failed++))
        echo "- [-] $name" >> .cache/checklist
        echo "Failed" | indent
      fi
    else
      echo "- [ ] $name" >> .cache/checklist
      echo "Skipped" | indent
    fi
  done
  if [[ $failed != 0 ]]; then
    return 1
  fi
}

quiet() {
  "$@" > /dev/null
}

indent() {
  local count=2
  local space
  space=$(printf "%${count}s")
  sed "s/^/$space| /g"
}
