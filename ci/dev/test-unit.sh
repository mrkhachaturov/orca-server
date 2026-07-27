#!/usr/bin/env bash

# Run the acceptance tests the series and the overlay carry.
#
# Our tests exercise Orca's internals, so they run under Orca's own vitest inside
# Orca's tree — code-server can test its src/ standalone because it wraps VS Code
# rather than injecting into it, and we cannot.
#
# They come from two places, for the same reason the code does: a test that adds
# a new file lives in the overlay, a test that modifies an upstream test file
# lives in the patch that modifies it. The list is derived from both, so adding
# either kind picks it up here automatically.
#
# Scoped on purpose. Upstream's full suite is not green under parallel load even
# on a pristine tag, so running all of it would report failures that are not
# ours. To judge a suspected upstream regression, run `pnpm test` inside
# lib/orca on the pristine tag first and compare.

set -Eeuo pipefail

main() {
  cd "$(dirname "$0")/../.."

  source ./ci/lib.sh

  if [[ ! -f lib/orca/package.json ]]; then
    echo >&2 "lib/orca is empty — run: git submodule update --init"
    exit 1
  fi

  local expected applied
  expected="$(grep -cv '^[[:space:]]*\(#\|$\)' patches/series)"
  applied="$(quilt applied 2> /dev/null | wc -l | tr -d ' ')"
  if [[ $applied != "$expected" ]]; then
    echo >&2 "only $applied of $expected patches are applied — run: quilt push -a"
    exit 1
  fi

  # The overlay has to be in the tree before its tests can run.
  ./ci/build/overlay.sh > /dev/null

  # Every *.test.ts / *.test.tsx the series touches or the overlay owns,
  # deduplicated and made relative to lib/orca. Overlay paths already are.
  local tests
  tests="$( {
    grep -h '^+++ orca-server/lib/orca/' patches/*.diff \
      | sed 's|^+++ orca-server/lib/orca/||'
    [ -d src ] && find src -type f
  } | grep -E '\.test\.tsx?$' | sort -u)"

  if [[ -z $tests ]]; then
    echo >&2 "no acceptance tests found in the series — that is itself a failure"
    exit 1
  fi

  echo "Running $(echo "$tests" | wc -l | tr -d ' ') acceptance test files"
  echo "$tests" | indent

  pushd lib/orca
  # shellcheck disable=SC2086
  pnpm exec vitest run --config config/vitest.config.ts $tests
  popd
}

main "$@"
