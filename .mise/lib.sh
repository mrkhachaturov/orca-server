#!/usr/bin/env bash
set -euo pipefail

pushd() {
  builtin pushd "$@" > /dev/null
}

popd() {
  builtin popd > /dev/null
}

orca_version() {
  jq -r .version lib/orca/package.json
}

# Orca 1.4.156 releases as 4.156.0; the last slot is ours ($1).
# Not `git describe`: actions/checkout fetches submodules shallow and untagged.
orca_server_version() {
  local version patch
  version="$(orca_version)"
  patch="${1:-0}"
  echo "${version#*.}.${patch}"
}

# A major ("24"). Match upstream's toolchain exactly — a newer pnpm breaks the
# frozen lockfile.
orca_node_version() {
  jq -r .engines.node lib/orca/package.json
}

# Resolves the major the way `actions/setup-node` does.
orca_node_full_version() {
  local major
  major="$(orca_node_version)"
  curl -fsSL https://nodejs.org/dist/index.json \
    | jq -r --arg m "v${major}." 'map(select(.version | startswith($m))) | .[0].version | ltrimstr("v")'
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
