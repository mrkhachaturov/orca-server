#!/usr/bin/env bash
#MISE description="Acceptance tests the series and the overlay carry"
#MISE dir="{{config_root}}"
#MISE depends=["up"]

# Scoped on purpose: upstream's full suite is not green under parallel load even
# on a pristine tag. To judge a suspected upstream regression, compare against
# `pnpm test` inside lib/orca on the pristine tag.

set -Eeuo pipefail

main() {

  source ./.mise/lib.sh

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

  local tests
  tests="$({
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
