#!/usr/bin/env bash

# Run the acceptance tests the series carries.
#
# Unlike code-server, our tests live inside the patches: they exercise Orca's
# internals, so they have to sit in Orca's tree and run under Orca's own vitest.
# The upside is that a patch already carries the test an upstream PR would need;
# the cost is that the list has to be derived rather than hard-coded, which is
# what this script does — it reads the test files straight out of the series, so
# adding a patch adds its tests here automatically.
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

  # Every *.test.ts / *.test.tsx a patch adds or touches, deduplicated and made
  # relative to lib/orca.
  local tests
  tests="$(grep -h '^+++ orca-server/lib/orca/' patches/*.diff \
    | sed 's|^+++ orca-server/lib/orca/||' \
    | grep -E '\.test\.tsx?$' \
    | sort -u)"

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
