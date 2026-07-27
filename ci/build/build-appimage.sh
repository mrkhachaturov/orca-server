#!/usr/bin/env bash

# Build the AppImage from the pinned submodule with the series applied.
#
#   ./ci/build/build-appimage.sh        -> ./dist/orca-server-<tag>-x86_64.AppImage
#
# Every version number the build needs is read off lib/orca, never from a
# literal in this repo: the submodule commit is the single pin.

set -Eeuo pipefail

main() {
  cd "$(dirname "${0}")/../.."

  source ./ci/lib.sh

  if [[ ! -f lib/orca/package.json ]]; then
    echo >&2 "lib/orca is empty — run: git submodule update --init"
    exit 1
  fi

  local tag
  tag="$(orca_tag)" || {
    echo >&2 "lib/orca is not parked on a tag; an untagged build is not releasable"
    exit 1
  }

  # The build consumes the working tree, so the series must be on it. quilt
  # exits 2 when there is nothing left to push, which is success here.
  local -i exit_code=0
  quilt push -a > /dev/null 2>&1 || exit_code=$?
  case $exit_code in
    0 | 2) ;;
    *)
      echo >&2 "the series does not apply cleanly — fix it before building"
      exit $exit_code
      ;;
  esac

  local applied
  applied="$(quilt applied 2> /dev/null | wc -l | tr -d ' ')"
  local expected
  expected="$(grep -cv '^[[:space:]]*\(#\|$\)' patches/series)"
  if [[ $applied != "$expected" ]]; then
    echo >&2 "only $applied of $expected patches are applied"
    exit 1
  fi

  # The artifact carries OUR version, the way code-server ships
  # code-server-4.129.0 rather than the Code version it was built from. Pass a
  # patch number as $1 to re-release the same Orca with a changed series.
  local version
  version="$(orca_server_version "${1:-0}")"

  echo "Building orca-server $version from Orca $tag with $applied patches applied"

  VERSION="$version" \
    PNPM_VERSION="$(orca_pnpm_version)" \
    docker buildx bake -f docker-bake.hcl appimage

  ls -l "$RELEASE_PATH"
}

main "$@"
