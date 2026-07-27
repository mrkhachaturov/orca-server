#!/usr/bin/env bash
#MISE description="Build the AppImage from the assembled tree"
#MISE dir="{{config_root}}"
#MISE depends=["up"]
#USAGE arg "[patch]" help="Patch number for a re-release of the same Orca (default 0)"
#USAGE flag "--platform <platform>" help="linux/amd64 or linux/arm64; defaults to this machine's"

# Output is ./dist/orca-server-<version>-<arch>.AppImage, where <arch> is
# `uname -m`, not the amd64/arm64 spelling --platform takes.

set -Eeuo pipefail

main() {

  source ./.mise/lib.sh

  if [[ ! -f lib/orca/package.json ]]; then
    echo >&2 "lib/orca is empty — run: git submodule update --init"
    exit 1
  fi

  local orca
  orca="$(orca_version)"

  local applied
  applied="$(quilt applied 2> /dev/null | wc -l | tr -d ' ')"
  local expected
  expected="$(grep -cv '^[[:space:]]*\(#\|$\)' patches/series)"
  if [[ $applied != "$expected" ]]; then
    echo >&2 "only $applied of $expected patches are applied — run: quilt push -a"
    exit 1
  fi

  local version
  version="$(orca_server_version "${usage_patch:-0}")"

  # arch() already normalises uname to Docker's spelling.
  local platform="${usage_platform:-linux/$(arch)}"
  case "$platform" in
    linux/amd64 | linux/arm64) ;;
    *)
      echo >&2 "unsupported platform: $platform (linux/amd64 or linux/arm64)"
      exit 1
      ;;
  esac

  if [[ $platform != "linux/$(arch)" ]]; then
    echo >&2 "NOTE: building $platform on $(arch) runs under qemu — slow. CI builds each natively."
  fi

  echo "Building orca-server $version for $platform from Orca $orca with $applied patches applied"

  VERSION="$version" \
    PNPM_VERSION="$(orca_pnpm_version)" \
    NODE_VERSION="$(orca_node_full_version)" \
    PLATFORMS="$platform" \
    docker buildx bake -f docker-bake.hcl appimage

  ls -l "$RELEASE_PATH"
}

main "$@"
